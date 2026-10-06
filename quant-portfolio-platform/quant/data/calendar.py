"""US equity trading calendar (NYSE-style holidays).

Markets do not trade every calendar day, and return calculations must use the
previous *available* trading observation. This module lets the synthetic data
generator and the validators reason about which dates should exist.
"""

from __future__ import annotations

import datetime as dt

import pandas as pd

# One-off full-day closures (national days of mourning etc.).
SPECIAL_CLOSURES = {
    dt.date(2018, 12, 5),   # President G.H.W. Bush
    dt.date(2025, 1, 9),    # President Carter
}


def _easter(year: int) -> dt.date:
    """Gregorian Easter Sunday (anonymous algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l_ = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l_) // 451
    month = (h + l_ - 7 * m + 114) // 31
    day = ((h + l_ - 7 * m + 114) % 31) + 1
    return dt.date(year, month, day)


def _nth_weekday(year: int, month: int, weekday: int, n: int) -> dt.date:
    d = dt.date(year, month, 1)
    offset = (weekday - d.weekday()) % 7
    return d + dt.timedelta(days=offset + 7 * (n - 1))


def _last_weekday(year: int, month: int, weekday: int) -> dt.date:
    nxt = dt.date(year + (month == 12), month % 12 + 1, 1)
    d = nxt - dt.timedelta(days=1)
    return d - dt.timedelta(days=(d.weekday() - weekday) % 7)


def _observed(d: dt.date, *, allow_friday: bool = True) -> dt.date | None:
    if d.weekday() == 5:  # Saturday -> Friday (NYSE skips this for New Year's)
        return d - dt.timedelta(days=1) if allow_friday else None
    if d.weekday() == 6:  # Sunday -> Monday
        return d + dt.timedelta(days=1)
    return d


def nyse_holidays(year: int) -> set[dt.date]:
    hols: set[dt.date | None] = {
        _observed(dt.date(year, 1, 1), allow_friday=False),
        _nth_weekday(year, 1, 0, 3),   # Martin Luther King Jr. Day
        _nth_weekday(year, 2, 0, 3),   # Washington's Birthday
        _easter(year) - dt.timedelta(days=2),  # Good Friday
        _last_weekday(year, 5, 0),     # Memorial Day
        _observed(dt.date(year, 7, 4)),
        _nth_weekday(year, 9, 0, 1),   # Labor Day
        _nth_weekday(year, 11, 3, 4),  # Thanksgiving
        _observed(dt.date(year, 12, 25)),
    }
    if year >= 2022:
        hols.add(_observed(dt.date(year, 6, 19)))  # Juneteenth
    hols.discard(None)
    return {h for h in hols if h is not None} | {d for d in SPECIAL_CLOSURES if d.year == year}


def trading_days(start: dt.date | str, end: dt.date | str) -> pd.DatetimeIndex:
    """All NYSE trading days in ``[start, end]`` (inclusive)."""
    start = pd.Timestamp(start).date()
    end = pd.Timestamp(end).date()
    hols: set[dt.date] = set()
    for y in range(start.year, end.year + 1):
        hols |= nyse_holidays(y)
    days = pd.bdate_range(start, end)
    return pd.DatetimeIndex([d for d in days if d.date() not in hols])


def last_completed_trading_day(today: dt.date | None = None) -> dt.date:
    """Most recent trading day strictly before ``today`` (its close is final)."""
    today = today or dt.date.today()
    days = trading_days(today - dt.timedelta(days=14), today - dt.timedelta(days=1))
    return days[-1].date()
