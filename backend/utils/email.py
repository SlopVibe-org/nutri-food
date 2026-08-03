"""Email helpers for NutriFood."""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import extensions as _ext


def send_email(to_email, subject, html_body, text_body):
    msg = MIMEMultipart('alternative')
    msg['From'] = 'NutriFood <ai@slopvibe.org>'
    msg['To'] = to_email
    msg['Subject'] = subject
    msg.attach(MIMEText(text_body, 'plain'))
    msg.attach(MIMEText(html_body, 'html'))
    try:
        with smtplib.SMTP_SSL(_ext.SMTP_HOST, _ext.SMTP_PORT) as server:
            server.login(_ext.SMTP_USER, _ext.SMTP_PASS)
            server.sendmail(_ext.MAIL_FROM, to_email, msg.as_string())
        print(f'[NutriFood] Email sent to {to_email}: {subject}')
        return True
    except Exception as e:
        print(f'[NutriFood] Email error: {e}')
        return False


def send_welcome_email(to_email, name):
    html = (
        '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f1117;color:#e4e4e7;padding:32px;border-radius:12px">'
        '<h1 style="color:#4ade80;margin-bottom:8px">🍎 Bienvenue sur NutriFood!</h1>'
        f'<p style="color:#94a3b8;font-size:1.05rem">Bonjour {name},</p>'
        '<p style="color:#e4e4e7">Votre compte a été créé avec succès. Vous pouvez maintenant planifier votre semaine nutritionnelle.</p>'
        f'<div style="margin:24px 0"><a href="{_ext.APP_URL}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#0f1117;text-decoration:none;border-radius:8px;font-weight:700">Commencer →</a></div>'
        '<p style="color:#94a3b8;font-size:0.85rem;margin-top:24px">NutriFood — slopvibe.org</p>'
        '</div>'
    )
    text = f"Bienvenue sur NutriFood!\n\nBonjour {name},\n\nVotre compte a ete cree avec succes.\n\nCommencez ici: {_ext.APP_URL}\n\nNutriFood — slopvibe.org"
    return send_email(to_email, 'Bienvenue sur NutriFood! 🍎', html, text)


def send_reset_email(to_email, name, token):
    reset_url = f"{_ext.APP_URL}#reset={token}"
    html = (
        '<div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0f1117;color:#e4e4e7;padding:32px;border-radius:12px">'
        '<h1 style="color:#4ade80;margin-bottom:8px">🔑 Réinitialisation de mot de passe</h1>'
        f'<p style="color:#94a3b8;font-size:1.05rem">Bonjour {name},</p>'
        '<p style="color:#e4e4e7">Vous avez demandé à réinitialiser votre mot de passe NutriFood.</p>'
        f'<div style="margin:24px 0"><a href="{reset_url}" style="display:inline-block;padding:12px 28px;background:#22c55e;color:#0f1117;text-decoration:none;border-radius:8px;font-weight:700">Changer mon mot de passe →</a></div>'
        '<p style="color:#94a3b8;font-size:0.85rem">Ce lien expire dans 1 heure. Si vous n\'avez pas fait cette demande, ignorez cet email.</p>'
        '<p style="color:#94a3b8;font-size:0.85rem;margin-top:24px">NutriFood — slopvibe.org</p>'
        '</div>'
    )
    text = f"Reinitialisation de mot de passe\n\nBonjour {name},\n\nCliquez ici pour changer votre mot de passe: {reset_url}\n\nCe lien expire dans 1 heure.\n\nNutriFood — slopvibe.org"
    return send_email(to_email, '🔑 Réinitialisation de mot de passe — NutriFood', html, text)
