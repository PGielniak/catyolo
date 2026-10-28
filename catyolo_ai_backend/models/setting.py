from sqlalchemy import Column, String
from models.base import Base


class Setting(Base):
    """Simple key/value store for global, worker-affecting settings.

    Rows are merged (upserted) by key. Values are stored as plain strings;
    parsing/serialization lives in SettingsService.
    """

    __tablename__ = 'settings'

    key = Column(String(64), primary_key=True)
    value = Column(String(255), nullable=False)
