import uuid
import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import Request

def log_action(
    db: Session,
    user_id: str,
    action_type: str,
    target_id: str = None,
    target_type: str = None,
    metadata: dict = None,
    request: Request = None
):
    """
    Logs an action to the audit_logs table.
    """
    ip_address = request.client.host if request and request.client else None
    metadata_json = json.dumps(metadata) if metadata else None
    
    db.execute(
        text("""
            INSERT INTO audit_logs (log_id, user_id, action_type, target_id, target_type, metadata, ip_address, timestamp)
            VALUES (:log_id, :user_id, :action_type, :target_id, :target_type, :metadata, :ip_address, :timestamp)
        """),
        {
            "log_id": str(uuid.uuid4()),
            "user_id": user_id,
            "action_type": action_type,
            "target_id": target_id,
            "target_type": target_type,
            "metadata": metadata_json,
            "ip_address": ip_address,
            "timestamp": datetime.now(timezone.utc).replace(tzinfo=None)
        }
    )
    db.commit()
