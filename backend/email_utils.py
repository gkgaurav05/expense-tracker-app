import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
FROM_EMAIL = os.environ.get("FROM_EMAIL", SMTP_USER)
APP_URL = os.environ.get("APP_URL", "http://localhost:3000")


async def send_reset_email(to_email: str, reset_token: str, user_name: str = "User"):
    """Send password reset email."""
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning(f"SMTP not configured. Reset link: {APP_URL}/reset-password?token={reset_token}")
        return False

    reset_link = f"{APP_URL}/reset-password?token={reset_token}"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', Arial, sans-serif; background-color: #0A0A0A; color: #ffffff; padding: 40px; }}
            .container {{ max-width: 500px; margin: 0 auto; background: #171717; border-radius: 16px; padding: 40px; }}
            .logo {{ font-size: 24px; font-weight: bold; color: #FDE047; margin-bottom: 24px; }}
            h1 {{ color: #ffffff; font-size: 20px; margin-bottom: 16px; }}
            p {{ color: #A1A1AA; line-height: 1.6; }}
            .button {{ display: inline-block; background: #FDE047; color: #0A0A0A; padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 600; margin: 24px 0; }}
            .footer {{ margin-top: 32px; padding-top: 24px; border-top: 1px solid #333; font-size: 12px; color: #71717A; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="logo">Spendrax</div>
            <h1>Reset Your Password</h1>
            <p>Hi {user_name},</p>
            <p>We received a request to reset your password. Click the button below to create a new password:</p>
            <a href="{reset_link}" class="button">Reset Password</a>
            <p>This link will expire in 1 hour.</p>
            <p>If you didn't request this, you can safely ignore this email.</p>
            <div class="footer">
                <p>This email was sent by Spendrax. If you have any questions, please contact support.</p>
            </div>
        </div>
    </body>
    </html>
    """

    text_content = f"""
    Hi {user_name},

    We received a request to reset your password.

    Click this link to reset your password:
    {reset_link}

    This link will expire in 1 hour.

    If you didn't request this, you can safely ignore this email.

    - Spendrax Team
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Reset Your Spendrax Password"
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email

        msg.attach(MIMEText(text_content, "plain"))
        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())

        logger.info(f"Reset email sent to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send reset email: {e}")
        logger.warning(f"Reset link (for debugging): {reset_link}")
        return False
