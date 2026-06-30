import os
import json
import sqlite3
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv
from google import genai

# 載入環境變數
load_dotenv()

app = Flask(__name__, static_folder='public', static_url_path='')
DB_FILE = 'questions.db'

# 初始化資料庫
def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            concept TEXT NOT NULL,
            tier TEXT NOT NULL,
            question TEXT NOT NULL,
            options TEXT NOT NULL,
            answer INTEGER NOT NULL,
            explanation TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

init_db()

# 初始化 Gemini 客戶端
client = genai.Client()

@app.route('/')
def serve_index():
    return send_from_directory('public', 'index.html')

@app.route('/api/generate-questions', methods=['POST'])
def generate_questions():
    data = request.json
    concept = data.get('concept', 'Python 基礎')
    tier = data.get('tier', 'Remember')
    count = data.get('count', 1)
    
    prompt = f"""
    身為一個資深的大學程式設計課程助教，請針對概念「{concept}」以及 Bloom's Taxonomy 的難度層級「{tier}」，
    設計 {count} 道優質的單選題（包含題目、4個選項、正確解答、詳解）。
    
    請務必以 JSON 陣列格式輸出，格式要求如下：
    [
        {{
            "question": "題目敘述...",
            "options": ["選項A", "選項B", "選項C", "選項D"],
            "answer": 0,  // 0 代表選項A，1 代表選項B，以此類推
            "explanation": "詳解..."
        }}
    ]
    
    請確保陣列中有確切的 {count} 個題目物件。
    請只輸出 JSON 陣列，不要有其他 Markdown 標記或文字。
    """
    
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        
        raw_text = response.text.strip()
        if raw_text.startswith("```json"):
            raw_text = raw_text[7:]
        if raw_text.endswith("```"):
            raw_text = raw_text[:-3]
            
        questions = json.loads(raw_text)
        return jsonify({"success": True, "data": questions})
        
    except Exception as e:
        print(f"Error generating questions: {e}")
        # MVP Fallback: 如果遇到 Quota 限制或 503，直接回傳寫死的假題目讓 UI 流程可以走下去
        fallback_question = {
            "question": f"【模擬產題】關於「{concept}」在難度「{tier}」的考題。下列哪一個選項是正確的？",
            "options": [
                "這是一個錯誤的敘述，因為不符合定義。",
                "這才是正確的敘述，完美符合該概念的核心精神。",
                "這個選項看起來很像對的，但其實是個常見的陷阱。",
                "這個選項完全偏離了主題。"
            ],
            "answer": 1,
            "explanation": f"因為目前 Gemini API 在您的網域/專案遇到了 Quota 限制 (limit: 0)，所以系統自動降級為「模擬產題模式」。在真實環境綁定帳單後，這裡就會是 AI 針對 {concept} 所產生的詳解！"
        }
        return jsonify({"success": True, "data": [fallback_question]})

@app.route('/api/save-question', methods=['POST'])
def save_question():
    data = request.json
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''
            INSERT INTO questions (concept, tier, question, options, answer, explanation)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            data['concept'],
            data['tier'],
            data['question'],
            json.dumps(data['options']),
            data['answer'],
            data['explanation']
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "儲存成功！"})
    except Exception as e:
        print(f"Error saving question: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/save-questions-bulk', methods=['POST'])
def save_questions_bulk():
    data = request.json
    questions = data.get('questions', [])
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        
        insert_data = []
        for q in questions:
            insert_data.append((
                q['concept'],
                q['tier'],
                q['question'],
                json.dumps(q['options']),
                q['answer'],
                q['explanation']
            ))
            
        c.executemany('''
            INSERT INTO questions (concept, tier, question, options, answer, explanation)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', insert_data)
        
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"成功儲存 {len(insert_data)} 題！"})
    except Exception as e:
        print(f"Error saving questions bulk: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions', methods=['GET'])
def get_questions():
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM questions ORDER BY created_at DESC')
        rows = c.fetchall()
        conn.close()
        
        questions = []
        for row in rows:
            q = dict(row)
            q['options'] = json.loads(q['options'])
            questions.append(q)
            
        return jsonify({"success": True, "data": questions})
    except Exception as e:
        print(f"Error getting questions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions/<int:q_id>', methods=['PUT'])
def update_question(q_id):
    data = request.json
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('''
            UPDATE questions 
            SET question = ?, options = ?, answer = ?, explanation = ?
            WHERE id = ?
        ''', (
            data.get('question'),
            json.dumps(data.get('options')),
            data.get('answer'),
            data.get('explanation'),
            q_id
        ))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "題目更新成功"})
    except Exception as e:
        print(f"Error updating question: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions/<int:q_id>', methods=['DELETE'])
def delete_question(q_id):
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute('DELETE FROM questions WHERE id = ?', (q_id,))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "題目刪除成功"})
    except Exception as e:
        print(f"Error deleting question: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions/batch-delete', methods=['POST'])
def batch_delete_questions():
    data = request.json
    ids = data.get('ids', [])
    if not ids:
        return jsonify({"success": False, "error": "未提供任何 ID"}), 400
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        placeholders = ','.join('?' * len(ids))
        c.execute(f'DELETE FROM questions WHERE id IN ({placeholders})', tuple(ids))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": f"成功刪除 {len(ids)} 題"})
    except Exception as e:
        print(f"Error batch deleting questions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/task-questions', methods=['GET'])
def get_task_questions():
    try:
        count = int(request.args.get('count', 5))
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute('SELECT * FROM questions ORDER BY RANDOM() LIMIT ?', (count,))
        rows = c.fetchall()
        conn.close()
        
        questions = []
        for row in rows:
            q = dict(row)
            q['options'] = json.loads(q['options'])
            questions.append(q)
            
        return jsonify({"success": True, "data": questions})
    except Exception as e:
        print(f"Error getting task questions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    print(f"Server starting on http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
