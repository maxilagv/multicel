def average_margin_delta(current_margins: list[float], suggested_margins: list[float]) -> float:
    if not current_margins or not suggested_margins:
        return 0.0
    deltas = [
        float(suggested) - float(current)
        for current, suggested in zip(current_margins, suggested_margins)
    ]
    return sum(deltas) / len(deltas) if deltas else 0.0
