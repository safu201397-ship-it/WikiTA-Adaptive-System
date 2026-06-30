import os
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.sql.expression import func
from dotenv import load_dotenv
from google import genai

# 載入環境變數
load_dotenv()

app = Flask(__name__, static_folder='public', static_url_path='')

# 設定資料庫連線 (自動適應本地 SQLite 或 Render PostgreSQL)
# Render 會在環境變數提供 DATABASE_URL (例如 postgres://...)
# 如果沒有，預設使用本地端的 sqlite:///quiz.db
db_url = os.environ.get('DATABASE_URL', 'sqlite:///quiz.db')
if db_url.startswith('postgres://'):
    db_url = db_url.replace('postgres://', 'postgresql://', 1)
    
app.config['SQLALCHEMY_DATABASE_URI'] = db_url
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# 定義資料庫模型
class Question(db.Model):
    __tablename__ = 'questions'
    id = db.Column(db.Integer, primary_key=True)
    concept = db.Column(db.String(255), nullable=False)
    tier = db.Column(db.String(50), nullable=False)
    question = db.Column(db.Text, nullable=False)
    options = db.Column(db.Text, nullable=False) # 儲存 JSON string
    answer = db.Column(db.Integer, nullable=False)
    explanation = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'concept': self.concept,
            'tier': self.tier,
            'question': self.question,
            'options': json.loads(self.options),
            'answer': self.answer,
            'explanation': self.explanation,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }

# 初始化資料庫
with app.app_context():
    db.create_all()

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
        new_q = Question(
            concept=data['concept'],
            tier=data['tier'],
            question=data['question'],
            options=json.dumps(data['options']),
            answer=data['answer'],
            explanation=data['explanation']
        )
        db.session.add(new_q)
        db.session.commit()
        return jsonify({"success": True, "message": "儲存成功！"})
    except Exception as e:
        db.session.rollback()
        print(f"Error saving question: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/save-questions-bulk', methods=['POST'])
def save_questions_bulk():
    data = request.json
    questions = data.get('questions', [])
    try:
        for q_data in questions:
            new_q = Question(
                concept=q_data['concept'],
                tier=q_data['tier'],
                question=q_data['question'],
                options=json.dumps(q_data['options']),
                answer=q_data['answer'],
                explanation=q_data['explanation']
            )
            db.session.add(new_q)
        db.session.commit()
        return jsonify({"success": True, "message": f"成功儲存 {len(questions)} 題！"})
    except Exception as e:
        db.session.rollback()
        print(f"Error saving questions bulk: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions', methods=['GET'])
def get_questions():
    try:
        questions = Question.query.order_by(Question.created_at.desc()).all()
        return jsonify({"success": True, "data": [q.to_dict() for q in questions]})
    except Exception as e:
        print(f"Error getting questions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions/<int:q_id>', methods=['PUT'])
def update_question(q_id):
    data = request.json
    try:
        q = Question.query.get(q_id)
        if not q:
            return jsonify({"success": False, "error": "Question not found"}), 404
            
        q.question = data.get('question', q.question)
        if 'options' in data:
            q.options = json.dumps(data.get('options'))
        q.answer = data.get('answer', q.answer)
        q.explanation = data.get('explanation', q.explanation)
        
        db.session.commit()
        return jsonify({"success": True, "message": "題目更新成功"})
    except Exception as e:
        db.session.rollback()
        print(f"Error updating question: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions/<int:q_id>', methods=['DELETE'])
def delete_question(q_id):
    try:
        q = Question.query.get(q_id)
        if not q:
            return jsonify({"success": False, "error": "Question not found"}), 404
            
        db.session.delete(q)
        db.session.commit()
        return jsonify({"success": True, "message": "題目刪除成功"})
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting question: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/questions/batch-delete', methods=['POST'])
def batch_delete_questions():
    data = request.json
    ids = data.get('ids', [])
    if not ids:
        return jsonify({"success": False, "error": "未提供任何 ID"}), 400
    try:
        Question.query.filter(Question.id.in_(ids)).delete(synchronize_session=False)
        db.session.commit()
        return jsonify({"success": True, "message": f"成功刪除 {len(ids)} 題"})
    except Exception as e:
        db.session.rollback()
        print(f"Error batch deleting questions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/task-questions', methods=['GET'])
def get_task_questions():
    try:
        count = int(request.args.get('count', 5))
        questions = Question.query.order_by(func.random()).limit(count).all()
        return jsonify({"success": True, "data": [q.to_dict() for q in questions]})
    except Exception as e:
        print(f"Error getting task questions: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
