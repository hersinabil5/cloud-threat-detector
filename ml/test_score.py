"""Self-check for score(): run with ml/.venv/bin/python ml/test_score.py"""
import random

from score import score

random.seed(0)
# Columns: events, distinct names, errors, sensitive writes, new IPs, identity age (hours)
normal = [[random.randint(5, 15), random.randint(3, 6), 0, 0, 0, 100 + h] for h in range(200)]
attack = [[40, 12, 24, 5, 1, 0]]  # brand-new identity: many denials and IAM writes
scores, outlier = score(normal + attack)
assert scores.argmax() == len(normal), "the attack hour should be the top outlier"
assert outlier[-1]
print("ok")
