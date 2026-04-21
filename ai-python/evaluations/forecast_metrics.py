def mean_absolute_percentage_error(actual: list[float], predicted: list[float]) -> float:
    pairs = [
        (abs(float(a)), abs(float(p)))
        for a, p in zip(actual, predicted)
        if float(a) != 0
    ]
    if not pairs:
        return 0.0
    return sum(abs((a - p) / a) for a, p in pairs) / len(pairs)


def weighted_absolute_percentage_error(actual: list[float], predicted: list[float]) -> float:
    numerator = sum(abs(float(a) - float(p)) for a, p in zip(actual, predicted))
    denominator = sum(abs(float(a)) for a in actual)
    if denominator == 0:
        return 0.0
    return numerator / denominator
