import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


def is_smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.EMAILS_FROM_EMAIL)


def send_email(
    to_email: str,
    subject: str,
    text_body: str,
    html_body: Optional[str] = None,
) -> bool:
    """
    Best-effort SMTP email sender.
    Returns True on success and False on failure/misconfiguration.
    """
    if not is_smtp_configured():
        logger.warning("SMTP is not configured; skipping email delivery.")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    message["To"] = to_email
    message.set_content(text_body)
    if html_body:
        message.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            if settings.SMTP_USE_STARTTLS:
                server.starttls(context=ssl.create_default_context())
                server.ehlo()
            if settings.SMTP_USER and settings.SMTP_PASSWORD:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to_email)
        return False
