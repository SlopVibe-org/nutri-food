"""Quebec seasonal produce calendar."""

QUEBEC_SEASONS = {
    # Fruits
    'bleuet': {'season': [7, 8], 'import': [1,2,3,4,5,6,9,10,11,12]},
    'fraise': {'season': [6, 7], 'import': [1,2,3,4,5,8,9,10,11,12]},
    'framboise': {'season': [7, 8], 'import': [1,2,3,4,5,6,9,10,11,12]},
    'pomme': {'season': [8,9,10,11,12,1,2,3,4,5], 'import': []},
    'poire': {'season': [8,9,10], 'import': [1,2,3,4,5,6,7,11,12]},
    'prune': {'season': [8,9], 'import': [1,2,3,4,5,6,7,10,11,12]},
    'raisin': {'season': [9,10], 'import': [1,2,3,4,5,6,7,8,11,12]},
    'canneberge': {'season': [9,10,11], 'import': [1,2,3,4,5,6,7,8,12]},
    'melon': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
    'nectarine': {'season': [8,9], 'import': [1,2,3,4,5,6,7,10,11,12]},
    'abricot': {'season': [7,8], 'import': [1,2,3,4,5,6,9,10,11,12]},
    'cerise': {'season': [6,7], 'import': [1,2,3,4,5,8,9,10,11,12]},
    'cassis': {'season': [7,8], 'import': [1,2,3,4,5,6,9,10,11,12]},
    'mure': {'season': [8,9], 'import': [1,2,3,4,5,6,7,10,11,12]},
    'mûre': {'season': [8,9], 'import': [1,2,3,4,5,6,7,10,11,12]},
    'groseille': {'season': [7,8], 'import': [1,2,3,4,5,6,9,10,11,12]},
    'rhubarbe': {'season': [5,6,7], 'import': []},
    # Vegetables
    'asperge': {'season': [5,6], 'import': [1,2,3,4,7,8,9,10,11,12]},
    'radis': {'season': [5,6,7,8,9], 'import': [1,2,3,4,10,11,12]},
    'laitue': {'season': [6,7,8,9], 'import': [1,2,3,4,5,10,11,12]},
    'epinard': {'season': [5,6,9,10], 'import': [1,2,3,4,7,8,11,12]},
    'épinard': {'season': [5,6,9,10], 'import': [1,2,3,4,7,8,11,12]},
    'tomate': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
    'mais': {'season': [8,9], 'import': []},
    'maïs': {'season': [8,9], 'import': []},
    'courge': {'season': [9,10,11], 'import': []},
    'citrouille': {'season': [9,10,11], 'import': []},
    'pomme de terre': {'season': [8,9,10,11,12,1,2,3], 'import': [4,5,6,7]},
    'carotte': {'season': [6,7,8,9,10], 'import': [1,2,3,4,5,11,12]},
    'brocoli': {'season': [6,7,8,9,10], 'import': [1,2,3,4,5,11,12]},
    'haricot': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
    'pois': {'season': [6,7], 'import': [1,2,3,4,5,8,9,10,11,12]},
    'poivron': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
    'chou': {'season': [6,7,8,9,10,11], 'import': [1,2,3,4,5,12]},
    'ail': {'season': [8,9,10,11,12], 'import': [1,2,3,4,5,6,7]},
    'oignon': {'season': [8,9,10,11,12,1,2,3], 'import': [4,5,6,7]},
    'poireau': {'season': [9,10,11], 'import': [1,2,3,4,5,6,7,8,12]},
    'betterave': {'season': [6,7,8,9,10], 'import': [1,2,3,4,5,11,12]},
    'navet': {'season': [7,8,9,10,11], 'import': [1,2,3,4,5,6,12]},
    'celeri': {'season': [8,9,10], 'import': [1,2,3,4,5,6,7,11,12]},
    'céleri': {'season': [8,9,10], 'import': [1,2,3,4,5,6,7,11,12]},
    'aubergine': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
    'courgette': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
    'zucchini': {'season': [7,8,9], 'import': [1,2,3,4,5,6,10,11,12]},
}


def lookup_quebec_season(food_name):
    """Look up Quebec seasonality for a food by keyword matching."""
    name_lower = food_name.lower()
    for keyword, seasons in QUEBEC_SEASONS.items():
        if keyword in name_lower:
            return seasons
    return None
