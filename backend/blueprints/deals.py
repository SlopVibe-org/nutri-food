"""Deals blueprint: /api/deals/*, deal fetching/filtering logic."""
from flask import Blueprint, request, jsonify

from extensions import ERR_FORBIDDEN
from blueprints.auth import get_auth_user
from utils.foods_helpers import (
    load_foods, load_raw_deals, filter_deals, is_raw_deals_fresh,
    trigger_raw_refresh_async, STORE_META,
)

bp = Blueprint('deals', __name__)


@bp.route('/api/deals', methods=['GET'])
def get_deals():
    """Serve FILTERED deals. Reads raw file, applies filters on the fly. Never modifies raw."""
    raw, updated = load_raw_deals()
    if raw is None:
        trigger_raw_refresh_async()
        return jsonify({'deals': {}, 'stores': STORE_META, 'updated': None, 'count': 0, 'building': True})
    if not is_raw_deals_fresh():
        trigger_raw_refresh_async()
    foods_data = load_foods()
    filtered = filter_deals(raw, foods_data)
    count = sum(len(v) for v in filtered.values())
    return jsonify({
        'deals': filtered,
        'stores': STORE_META,
        'updated': updated,
        'count': count
    })


@bp.route('/api/deals/refresh', methods=['POST'])
def force_refresh_deals():
    user = get_auth_user()
    if not user or not user['is_admin']:
        return jsonify({'error': ERR_FORBIDDEN}), 403
    started = trigger_raw_refresh_async()
    raw, updated = load_raw_deals()
    count = sum(len(v) for v in raw.values()) if raw else 0
    return jsonify({
        'status': 'ok',
        'started': started,
        'message': 'Refresh lancé' if started else 'Refresh déjà en cours',
        'raw_count': count,
        'updated': updated
    })
