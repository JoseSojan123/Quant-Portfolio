"""Outgoing email. Without SMTP settings, messages are logged instead of sent
(the link is also returned to the browser in development so the flow is testable)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import get_settings

log = logging.getLogger("qpp.email")


def send_email(to: str, subject: str, body: str) -> bool:
    s = get_settings()
    if not s.smtp_host:
        log.info("Email to %s (SMTP not configured, not sent): %s\n%s", to, subject, body)
        return False
    msg = EmailMessage()
    msg["From"] = s.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if s.smtp_user:
                smtp.login(s.smtp_user, s.smtp_password or "")
            smtp.send_message(msg)
        return True
    except Exception:  # never log credentials, only the failure
        log.exception("Failed to send email to %s", to)
        return False
