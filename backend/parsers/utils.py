"""
Utility functions for transaction parsing and categorization.
"""

import re
import hashlib
from typing import Optional, List
from collections import defaultdict
import pandas as pd


# Patterns that indicate a credit/income transaction
CREDIT_PATTERNS = [
    r'received\s+from', r'credited', r'credit', r'refund', r'cashback',
    r'cash\s*back', r'reversal', r'money\s+received', r'payment\s+received',
    r'salary', r'bonus', r'reimbursement', r'settlement', r'interest\s+credit',
    r'dividend', r'rental\s+income', r'from\s+savings', r'transfer\s+from'
]


# Default merchant keyword database for auto-categorization
# Keywords are matched case-insensitively against transaction descriptions
DEFAULT_CATEGORY_KEYWORDS = {
    'Food & Dining': [
        # Food delivery apps (ordering food)
        'swiggy', 'zomato', 'dunzo food',
        # Restaurants & cafes
        'dominos', 'domino', 'pizza hut', 'pizzahut', 'mcdonalds', 'mcdonald',
        'burger king', 'kfc', 'subway', 'starbucks', 'cafe coffee day', 'ccd',
        'barista', 'costa coffee', 'chaayos', 'tea post', 'chai point',
        'haldiram', 'bikanervala', 'sagar ratna', 'saravana bhavan',
        'restaurant', 'cafe', 'dhaba', 'kitchen', 'biryani',
        'bakery', 'sweet', 'mithai', 'juice', 'lassi', 'ice cream', 'baskin robbins',
        'naturals', 'cream stone', 'faasos', 'behrouz', 'box8', 'eatfit',
        'freshmenu', 'rebel foods',
    ],
    'Groceries': [
        # Grocery delivery apps
        'blinkit', 'zepto', 'instamart', 'bigbasket', 'grofers', 'jiomart',
        'dunzo daily', 'amazon fresh', 'flipkart grocery',
        # Supermarkets & stores
        'dmart', 'd mart', 'more retail', 'reliance fresh', 'spencers', 'star bazaar',
        'big bazaar', 'spar', 'hypercity', 'nature basket', 'godrej nature',
        'ratnadeep', 'heritage fresh', 'easyday', 'nilgiris',
        # Meat & vegetables
        'licious', 'freshtohome', 'meatigo', 'zappfresh', 'fresh to home',
        'sabji', 'vegetable', 'veggie', 'fruit', 'kirana', 'provision',
        'grocery', 'groceries', 'supermarket',
    ],
    'Transport': [
        # Ride sharing (daily commute)
        'uber', 'ola', 'rapido', 'meru', 'blu smart', 'blusmart',
        # Public transport (daily)
        'metro', 'dmrc', 'bmrc', 'cmrl', 'local train', 'suburban',
        # Fuel & parking
        'petrol', 'diesel', 'fuel', 'hp ', 'indian oil', 'iocl', 'bpcl', 'bharat petroleum',
        'hindustan petroleum', 'hpcl', 'shell', 'nayara', 'reliance petroleum',
        'parking', 'fastag', 'toll', 'paytm fastag',
        # Auto & vehicle
        'auto', 'rickshaw', 'taxi', 'cab',
    ],
    'Travel': [
        # Flights
        'indigo', 'spicejet', 'airindia', 'air india', 'vistara', 'goair', 'go first',
        'akasa', 'flight', 'airline', 'airways',
        # Train bookings (long distance)
        'irctc', 'indian railway', 'railways', 'train ticket', 'tatkal',
        # Bus bookings (long distance)
        'redbus', 'abhibus', 'ksrtc', 'msrtc', 'upsrtc', 'rsrtc', 'gsrtc', 'apsrtc', 'tsrtc',
        # Travel booking platforms
        'makemytrip', 'cleartrip', 'yatra', 'ixigo', 'easemytrip', 'goibibo',
        'booking.com', 'agoda', 'trivago', 'expedia', 'tripadvisor',
        # Hotels & stays
        'hotel', 'resort', 'oyo', 'treebo', 'fabhotel', 'zostel', 'hostel',
        'airbnb', 'homestay', 'lodge', 'inn',
        # Travel related
        'vacation', 'holiday', 'trip', 'tour', 'travel', 'tourism',
        'passport', 'visa', 'forex', 'currency exchange',
    ],
    'Shopping': [
        # E-commerce
        'amazon', 'flipkart', 'myntra', 'ajio', 'meesho', 'snapdeal', 'shopclues',
        'tatacliq', 'tata cliq', 'nykaa', 'purplle', 'mamaearth', 'wow skin',
        'lenskart', 'firstcry', 'hopscotch', 'bewakoof', 'souled store',
        # Fashion brands
        'zara', 'h&m', 'uniqlo', 'levis', 'pepe jeans', 'wrangler', 'allen solly',
        'van heusen', 'peter england', 'louis philippe', 'raymond', 'manyavar',
        'fabindia', 'westside', 'pantaloons', 'lifestyle', 'shoppers stop', 'central',
        'reliance trends', 'max fashion', 'fbb', 'brand factory',
        # Electronics
        'croma', 'reliance digital', 'vijay sales', 'poorvika', 'sangeetha mobiles',
        'apple store', 'samsung', 'oneplus', 'mi store', 'xiaomi',
        # Furniture & home
        'ikea', 'home centre', 'hometown', 'pepperfry', 'urban ladder', 'furlenco',
        # General
        'mall', 'mart', 'store', 'shop', 'retail', 'bazaar', 'emporium',
    ],
    'Entertainment': [
        # Movies & events
        'pvr', 'inox', 'cinepolis', 'carnival', 'miraj', 'bookmyshow', 'paytm movies',
        'movie', 'cinema', 'multiplex', 'theatre', 'theater',
        # Gaming
        'playstation', 'xbox', 'steam', 'epic games', 'nintendo', 'google play games',
        'pubg', 'bgmi', 'freefire', 'codm', 'valorant', 'gaming',
        # Others
        'concert', 'event', 'show', 'amusement', 'theme park', 'wonderla', 'imagica',
        'escape room', 'bowling', 'arcade', 'club', 'lounge', 'bar', 'pub',
    ],
    'Subscriptions': [
        # Video streaming
        'netflix', 'amazon prime', 'prime video', 'hotstar', 'disney plus', 'sony liv',
        'zee5', 'voot', 'jiocinema', 'mxplayer', 'altbalaji', 'eros now',
        # Music streaming
        'spotify', 'gaana', 'wynk', 'jiosaavn', 'apple music', 'youtube premium',
        'youtube music', 'audible',
        # Cloud & productivity
        'google one', 'icloud', 'dropbox', 'microsoft 365', 'office 365',
        'adobe', 'creative cloud', 'canva', 'notion', 'evernote',
        # News & magazines
        'economic times', 'times prime', 'magzter', 'kindle unlimited',
        # Others
        'subscription', 'membership', 'monthly plan', 'annual plan', 'renewal',
        'premium', 'pro plan', 'plus plan',
    ],
    'Health': [
        # Pharmacies
        'apollo pharmacy', 'medplus', 'netmeds', '1mg', 'pharmeasy', 'healthkart',
        'wellness forever', 'frank ross', 'guardian pharmacy', 'medicine', 'pharmacy',
        'chemist', 'medical', 'pharma', 'drug',
        # Hospitals & clinics
        'apollo hospital', 'fortis', 'max hospital', 'medanta', 'manipal hospital',
        'narayana health', 'aster', 'columbia asia', 'cloudnine', 'motherhood',
        'hospital', 'clinic', 'diagnostic', 'pathology', 'lab', 'healthcare',
        'doctor', 'dr.', 'dr ', 'dentist', 'dental', 'eye care', 'optician',
        # Fitness
        'gym', 'fitness', 'cult.fit', 'cultfit', 'gold gym', 'anytime fitness',
        'yoga', 'crossfit', 'zumba', 'healthify',
        # Insurance
        'health insurance', 'mediclaim', 'star health', 'care health', 'niva bupa',
    ],
    'Education': [
        # Online learning platforms
        'udemy', 'coursera', 'skillshare', 'linkedin learning', 'pluralsight',
        'edx', 'khan academy', 'unacademy', 'byjus', 'vedantu', 'toppr',
        'upgrad', 'simplilearn', 'great learning', 'scaler', 'coding ninjas',
        'whitehat jr', 'cuemath',
        # Books & stationery
        'amazon books', 'flipkart books', 'crossword', 'landmark', 'om book shop',
        'sapna book', 'book', 'stationery', 'notebook', 'pen',
        # Schools & colleges
        'school', 'college', 'university', 'institute', 'academy', 'tuition',
        'coaching', 'classes', 'tutorial', 'education', 'course', 'training',
        # Exams & certifications
        'exam fee', 'registration fee', 'certification', 'test fee',
    ],
    'Bills & Utilities': [
        # Electricity
        'bescom', 'bses', 'tata power', 'adani electricity', 'torrent power',
        'msedcl', 'tneb', 'apspdcl', 'tsspdcl', 'wbsedcl', 'cesc', 'electricity',
        'electric', 'power bill', 'eb bill',
        # Water & gas
        'water bill', 'bwssb', 'water board', 'water supply', 'jal board',
        'gas bill', 'png', 'piped gas', 'indraprastha gas', 'mahanagar gas', 'gail',
        'hp gas', 'bharat gas', 'indane', 'lpg', 'cylinder',
        # Telecom & internet
        'airtel', 'jio', 'vodafone', 'vi ', ' vi ', 'idea', 'bsnl', 'mtnl',
        'postpaid', 'prepaid', 'recharge', 'mobile bill', 'phone bill',
        'broadband', 'wifi', 'internet', 'fiber', 'act fibernet', 'hathway',
        'tata sky', 'dish tv', 'airtel dth', 'd2h', 'sun direct', 'dth',
        # Rent & housing
        'rent', 'house rent', 'flat rent', 'society', 'maintenance', 'housing',
        # EMI & loans
        'emi', 'loan', 'home loan', 'car loan', 'personal loan', 'education loan',
        'hdfc loan', 'icici loan', 'sbi loan', 'bajaj finserv', 'tata capital',
    ],
}


def categorize_by_keywords(description: str) -> Optional[str]:
    """
    Categorize a transaction based on keyword matching.
    Returns category name if matched, None otherwise.
    """
    if not description:
        return None

    desc_lower = description.lower()

    # Check each category's keywords
    for category, keywords in DEFAULT_CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            # Use word boundary for short keywords to avoid false matches
            if len(keyword) <= 3:
                # For very short keywords, require word boundaries
                if re.search(r'\b' + re.escape(keyword) + r'\b', desc_lower):
                    return category
            else:
                # For longer keywords, simple substring match is fine
                if keyword in desc_lower:
                    return category

    return None


def is_likely_credit(description: str) -> bool:
    """Check if transaction description indicates a credit/income."""
    if not description:
        return False
    desc_lower = description.lower()
    for pattern in CREDIT_PATTERNS:
        if re.search(pattern, desc_lower):
            return True
    return False


def detect_reversal_pairs(transactions: List[dict]) -> List[dict]:
    """
    Detect same-day, same-amount debit-credit pairs that indicate reversals.

    When a transaction fails or is cancelled, banks typically show:
    1. A debit (money out)
    2. An immediate credit refund (money back in)

    This function detects such pairs and marks both transactions with is_reversal=True.
    The UI can then auto-exclude these from import.
    """
    # Group transactions by date and amount
    # Key: (date, amount) -> list of transaction indices
    date_amount_groups = defaultdict(list)

    for idx, txn in enumerate(transactions):
        key = (txn.get('date'), txn.get('amount'))
        date_amount_groups[key].append(idx)

    # Find reversal pairs: same date, same amount, one debit + one credit
    reversal_indices = set()

    for (date, amount), indices in date_amount_groups.items():
        if len(indices) < 2:
            continue

        # Separate debits and credits
        debits = [i for i in indices if transactions[i].get('type') == 'expense']
        credits = [i for i in indices if transactions[i].get('type') == 'income']

        # Match debits with credits (1:1 pairing)
        # If we have 2 debits and 1 credit, only 1 debit is a reversal
        pairs_to_mark = min(len(debits), len(credits))

        for i in range(pairs_to_mark):
            reversal_indices.add(debits[i])
            reversal_indices.add(credits[i])

    # Mark reversal transactions
    for idx in reversal_indices:
        transactions[idx]['is_reversal'] = True
        transactions[idx]['reversal_note'] = 'Same-day matching debit/credit detected - likely cancelled or reversed transaction'

    # Ensure non-reversals have the flag set to False
    for idx, txn in enumerate(transactions):
        if idx not in reversal_indices:
            txn['is_reversal'] = False

    return transactions


def parse_date_flexible(date_text: str) -> Optional[str]:
    """Try multiple date formats to parse a date string."""
    if not date_text:
        return None

    # Clean the date text
    date_text = date_text.strip()

    # Handle credit card format: "18 Mar\n'26" -> "18 Mar 26"
    # Remove newlines and apostrophes, normalize spaces
    date_text = date_text.replace('\n', ' ').replace("'", '').strip()
    date_text = re.sub(r'\s+', ' ', date_text)

    # Take first part if there's time component
    if ' ' in date_text and ':' in date_text:
        date_text = date_text.split()[0]

    date_formats = [
        '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y', '%m/%d/%Y',
        '%d-%b-%Y', '%d %b %Y', '%b %d, %Y', '%d %B %Y',
        '%d-%m-%y', '%d/%m/%y', '%Y/%m/%d',
        '%d %b %y',  # "18 Mar 26" (2-digit year)
    ]

    for fmt in date_formats:
        try:
            return pd.to_datetime(date_text, format=fmt).strftime('%Y-%m-%d')
        except:
            continue

    # Last resort: let pandas try to parse it
    try:
        return pd.to_datetime(date_text).strftime('%Y-%m-%d')
    except:
        return None


def extract_payee_id(description: str) -> Optional[str]:
    """Extract UPI ID, phone number, or merchant identifier from description."""
    if not description:
        return None

    desc_lower = description.lower().strip()

    # Extract UPI ID patterns (xxx@bank, xxx@upi, etc.)
    upi_match = re.search(r'([a-zA-Z0-9._-]+@[a-zA-Z]+)', desc_lower)
    if upi_match:
        return upi_match.group(1)

    # Extract phone numbers (10 digits)
    phone_match = re.search(r'\b(\d{10})\b', description)
    if phone_match:
        return f"phone:{phone_match.group(1)}"

    # Extract merchant names (first meaningful part, cleaned)
    # Remove common prefixes/suffixes
    cleaned = re.sub(r'(paid to|payment to|sent to|received from|upi|imps|neft|ref|txn)[\s:]*', '', desc_lower)
    cleaned = re.sub(r'[^a-z0-9\s]', '', cleaned).strip()

    if cleaned and len(cleaned) > 2:
        # Take first 2-3 words as identifier
        words = cleaned.split()[:3]
        return "merchant:" + "_".join(words)

    return None


def generate_transaction_hash(date: str, amount: float, description: str) -> str:
    """Generate a unique hash for a transaction based on date, amount, and description."""
    # Normalize: lowercase description, round amount to 2 decimals
    normalized_desc = (description or "").lower().strip()
    normalized_amount = round(amount, 2)
    hash_input = f"{date}|{normalized_amount}|{normalized_desc}"
    return hashlib.md5(hash_input.encode()).hexdigest()
