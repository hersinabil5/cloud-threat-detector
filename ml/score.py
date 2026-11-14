"""Placeholder: scores events with an isolation forest. Not wired to the DB or Lambda.
Day 5 replaces the toy features with per-identity features built from the events table."""
import numpy as np
from sklearn.ensemble import IsolationForest

# One row per event: [hour_of_day, is_new_ip, is_iam_call, is_error]
normal = [[h, 0, 0, 0] for h in (9, 10, 11, 13, 14, 15, 16)] * 10
attack = [[3, 1, 1, 1]]
X = np.array(normal + attack)

model = IsolationForest(random_state=0).fit(X)
scores = -model.score_samples(X)  # higher = more unusual

if __name__ == "__main__":
    for row, s in list(zip(X.tolist(), scores))[-3:]:
        print(f"{s:.3f}  {row}")
    assert scores.argmax() == len(X) - 1, "the 3am new-IP IAM error should be the top outlier"
    print("ok")
