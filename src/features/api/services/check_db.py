import sqlite3

def check_rarities():
    db_path = r'f:\Phatnt-sources\tcg-cards-shop-webpage\public\data\cards.sqlite'
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("--- Distinct Rarities ---")
        cursor.execute("SELECT DISTINCT rarity FROM cards;")
        rarities = cursor.fetchall()
        for r in rarities:
            print(r[0])
            
        print("\n--- Column Names in cards table ---")
        cursor.execute("PRAGMA table_info(cards);")
        columns = cursor.fetchall()
        for col in columns:
            print(col[1])
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_rarities()
