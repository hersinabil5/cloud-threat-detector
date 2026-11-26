"""Scores each identity's activity, one hour at a time, with an isolation forest and writes the outliers to `alerts`.
Run: DATABASE_URL=... ml/.venv/bin/python ml/score.py   (safe to re-run: existing ML alerts get their score updated)"""
import os

import numpy as np
import psycopg
from sklearn.ensemble import IsolationForest

REASON = "Unusual activity for this identity (ML outlier)"
CONTAMINATION = 0.03  # share of identity-hours flagged; ~1 in 33

# One row per (identity, hour). Events with no identity (AWS service events) are skipped.
FEATURES_SQL = """
WITH e AS (
  SELECT *, date_trunc('hour', event_time) AS hr,
         event_time = min(event_time) OVER (PARTITION BY identity_arn, source_ip) AS new_ip,
         min(event_time) OVER (PARTITION BY identity_arn) AS first_seen
  FROM events WHERE identity_arn IS NOT NULL
)
SELECT identity_arn, hr,
       (array_agg(event_id ORDER BY event_time))[1] AS first_event,
       count(*)                                                        AS n_events,
       count(DISTINCT event_name)                                      AS n_names,
       count(error_code)                                               AS n_errors,
       count(*) FILTER (WHERE event_source IN ('iam.amazonaws.com', 'cloudtrail.amazonaws.com', 'sts.amazonaws.com')
                          AND event_name !~ '^(Get|List|Describe|Lookup)') AS n_sensitive_writes,
       count(*) FILTER (WHERE new_ip)                                  AS n_new_ips,
       extract(epoch FROM hr - date_trunc('hour', min(first_seen))) / 3600 AS identity_age_hours
FROM e GROUP BY identity_arn, hr
"""


def score(X):
    """X: rows of numeric features. Returns (scores, is_outlier); higher score = more unusual."""
    X = np.log1p(np.asarray(X, dtype=float))  # counts are heavy-tailed; log keeps one busy hour from dominating
    model = IsolationForest(contamination=CONTAMINATION, random_state=0).fit(X)
    return -model.score_samples(X), model.predict(X) == -1


def main():
    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        rows = conn.execute(FEATURES_SQL).fetchall()
        scores, outlier = score([r[3:] for r in rows])
        # Upsert on the same (event_id, reason) key the rule alerts use, so re-runs don't duplicate.
        conn.cursor().executemany(
            """INSERT INTO alerts (created_at, severity, identity_arn, reason, event_id, score)
               VALUES (%s, 'low', %s, %s, %s, %s)
               ON CONFLICT (event_id, reason) DO UPDATE SET score = EXCLUDED.score""",
            [(r[1], r[0], REASON, r[2], float(s)) for r, s, o in zip(rows, scores, outlier) if o],
        )
    print(f"{len(rows)} identity-hours scored, {int(outlier.sum())} written as alerts. Top 10:")
    print("score  flag  hour              events names errors writes new_ips age_h  identity")
    for i in np.argsort(-scores)[:10]:
        r = rows[i]
        who = r[0].split(":")[-1]  # drop the account number from the printout
        print(f"{scores[i]:.3f}  {'*' if outlier[i] else ' '}     {r[1]:%Y-%m-%d %H:%M}  "
              + " ".join(f"{v:>6.0f}" for v in r[3:]) + f"  {who}")


if __name__ == "__main__":
    main()
