document.addEventListener('DOMContentLoaded', () => {
    // --- View Toggling ---
    const viewToggleBtn = document.getElementById('view-toggle');
    const studentView = document.getElementById('student-view');
    const teacherView = document.getElementById('teacher-view');
    let isTeacherView = false;

    viewToggleBtn.addEventListener('click', () => {
        isTeacherView = !isTeacherView;
        if (isTeacherView) {
            studentView.classList.add('hidden');
            teacherView.classList.remove('hidden');
            viewToggleBtn.textContent = '切換至學生端 (Student View)';
            renderHeatmap(); 
            loadQuestionBank(); // Load saved questions when entering teacher view
        } else {
            teacherView.classList.add('hidden');
            studentView.classList.remove('hidden');
            viewToggleBtn.textContent = '切換至教師端 (Teacher View)';
        }
    });

    // --- Student Quiz Mock (Adaptive Engine) ---
    const startQuizBtn = document.querySelector('.start-quiz');
    const quizArea = document.getElementById('quiz-area');
    const closeQuizBtn = document.querySelector('.close-quiz');
    const quizContent = document.getElementById('quiz-content');
    const quizActions = document.getElementById('quiz-actions');
    const btnNextQuestion = document.getElementById('btn-next-question');
    const quizProgressBadge = document.getElementById('quiz-progress-badge');
    const quizDifficultyBadge = document.getElementById('quiz-difficulty-badge');

    const tierToLevel = {
        'Remember': 1,
        'Understand': 2,
        'Apply': 3,
        'Analyze': 4,
        'Evaluate': 5,
        'Create': 6
    };
    
    const levelToTier = {
        1: 'Remember', 2: 'Understand', 3: 'Apply', 4: 'Analyze', 5: 'Evaluate', 6: 'Create'
    };

    let studentFullBank = [];
    let studentUsedIds = new Set();
    let studentCurrentIndex = 0;
    let studentCorrectCount = 0;
    let studentTaskCount = 5;
    let currentDifficulty = 1;
    let currentQuestion = null;

    startQuizBtn.addEventListener('click', () => {
        quizArea.classList.remove('hidden');
        renderMockQuiz();
    });

    closeQuizBtn.addEventListener('click', () => {
        quizArea.classList.add('hidden');
    });

    async function renderMockQuiz() {
        quizContent.innerHTML = `<div class="loader"></div><p style="text-align:center; color:var(--text-secondary);">適性測驗引擎啟動中，正在載入題庫...</p>`;
        quizActions.classList.add('hidden');
        quizDifficultyBadge.style.display = 'none';
        
        studentFullBank = [];
        studentUsedIds = new Set();
        studentCurrentIndex = 0;
        studentCorrectCount = 0;
        currentDifficulty = 1; // 預設從 Level 1 (Remember) 開始
        
        studentTaskCount = parseInt(document.getElementById('task-question-count').value, 10) || 5;

        try {
            // 一次載入所有審核通過的題庫供適性引擎挑選
            const response = await fetch(`/api/questions`);
            const data = await response.json();
            
            if (data.success && data.data && data.data.length > 0) {
                studentFullBank = data.data;
                renderSingleQuestion();
            } else {
                quizProgressBadge.textContent = "任務發生錯誤";
                quizContent.innerHTML = `
                    <div class="empty-state" style="color:var(--danger-color);">
                        目前系統題庫中沒有可用的題目！<br><br>
                        <span style="font-size:0.9em; color:var(--text-secondary);">
                        （請先切換至「教師端」，使用 AI 產生題目並點擊「儲存至我的題庫」）
                        </span>
                    </div>`;
            }
        } catch (e) {
            console.error("Error in renderMockQuiz:", e);
            quizContent.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">連線錯誤: ${e.message}</div>`;
        }
    }

    function renderSingleQuestion() {
        if (studentCurrentIndex >= studentTaskCount || studentUsedIds.size >= studentFullBank.length) {
            // 任務結算
            quizProgressBadge.textContent = "任務完成";
            quizDifficultyBadge.style.display = 'none';
            quizActions.classList.add('hidden');
            quizContent.innerHTML = `
                <div style="text-align:center; padding: 30px;">
                    <h2 style="color: var(--success-color); margin-bottom: 10px;">🎉 任務完成！</h2>
                    <p style="font-size: 1.2rem;">本次測驗共 ${studentCurrentIndex} 題</p>
                    <p style="font-size: 1.5rem; font-weight: bold;">答對了 ${studentCorrectCount} 題</p>
                    <p style="margin-top: 10px; color: var(--text-secondary);">最終達到難度：${levelToTier[currentDifficulty]} ${'⭐️'.repeat(currentDifficulty)}</p>
                    <button class="btn primary" style="margin-top:20px;" onclick="document.querySelector('.close-quiz').click()">結束測驗</button>
                </div>
            `;
            return;
        }

        // 適性挑題邏輯
        let candidates = studentFullBank.filter(q => tierToLevel[q.tier] === currentDifficulty && !studentUsedIds.has(q.id));
        
        // Fallback: 如果該難度沒題目了，找最接近的難度
        if (candidates.length === 0) {
            let offset = 1;
            while(candidates.length === 0 && offset <= 5) {
                candidates = studentFullBank.filter(q => 
                    (tierToLevel[q.tier] === currentDifficulty + offset || tierToLevel[q.tier] === currentDifficulty - offset) 
                    && !studentUsedIds.has(q.id)
                );
                offset++;
            }
        }

        // 如果真的都沒題目了 (題庫太少)
        if (candidates.length === 0) {
            studentTaskCount = studentCurrentIndex; // 強制結束
            renderSingleQuestion();
            return;
        }

        // 隨機抽一題
        currentQuestion = candidates[Math.floor(Math.random() * candidates.length)];
        // 修正 currentDifficulty 以符合實際抽出的題目難度
        currentDifficulty = tierToLevel[currentQuestion.tier];
        studentUsedIds.add(currentQuestion.id);

        quizProgressBadge.textContent = `第 ${studentCurrentIndex + 1} / ${studentTaskCount} 題`;
        quizDifficultyBadge.style.display = 'inline-block';
        quizDifficultyBadge.textContent = `難度: ${currentQuestion.tier} ${'⭐️'.repeat(currentDifficulty)}`;
        quizActions.classList.add('hidden');
        
        let optionsHtml = '';
        const safeExplanation = currentQuestion.explanation.replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        currentQuestion.options.forEach((opt, idx) => {
            const isCorrect = (idx === currentQuestion.answer);
            optionsHtml += `<button class="quiz-option" onclick="handleMockAnswer(${isCorrect}, this, '${safeExplanation}')">${String.fromCharCode(65+idx)}. ${opt}</button>`;
        });
        
        quizContent.innerHTML = `
            <h4>${currentQuestion.question}</h4>
            <div class="quiz-options" style="margin-top:15px;">
                ${optionsHtml}
            </div>
            <div id="mock-feedback" class="hidden"></div>
        `;
    }

    window.handleMockAnswer = (isCorrect, btn, explanation) => {
        // Disable all buttons after answer
        const allBtns = btn.parentElement.querySelectorAll('.quiz-option');
        allBtns.forEach(b => b.disabled = true);

        const feedback = document.getElementById('mock-feedback');
        feedback.classList.remove('hidden');
        if (isCorrect) {
            studentCorrectCount++;
            // 答對，難度升級
            const oldDiff = currentDifficulty;
            currentDifficulty = Math.min(6, currentDifficulty + 1);
            const levelUpMsg = currentDifficulty > oldDiff ? ` (準備挑戰更難的 ${levelToTier[currentDifficulty]} 題型！)` : ' (已達最高難度！)';
            
            btn.style.borderColor = 'var(--success-color)';
            feedback.innerHTML = `<div class="explanation-box" style="border-left-color: var(--success-color); background: rgba(16, 185, 129, 0.1);">
                <h4 style="color: var(--success-color);">答對了！${levelUpMsg}</h4>
                <p>${explanation}</p>
            </div>`;
        } else {
            // 答錯，難度降級
            const oldDiff = currentDifficulty;
            currentDifficulty = Math.max(1, currentDifficulty - 1);
            const levelDownMsg = currentDifficulty < oldDiff ? ` (將降級至 ${levelToTier[currentDifficulty]} 題型重新鞏固！)` : ' (加把勁！)';

            btn.style.borderColor = 'var(--danger-color)';
            feedback.innerHTML = `<div class="explanation-box">
                <h4>答錯了。${levelDownMsg}</h4>
                <p>${explanation}</p>
            </div>`;
        }
        
        // Show next button
        quizActions.classList.remove('hidden');
        if (studentCurrentIndex === studentTaskCount - 1) {
            btnNextQuestion.textContent = "查看結算 🏆";
        } else {
            btnNextQuestion.textContent = "下一題 ⏭️";
        }
    }

    btnNextQuestion.addEventListener('click', () => {
        studentCurrentIndex++;
        renderSingleQuestion();
    });


    // --- Teacher Heatmap Mock ---
    const heatmapContainer = document.getElementById('heatmap-container');
    const concepts = ['Pointers', 'OOP', 'Data Structs', 'Recursion', 'Big-O', 'Hash Tables'];
    const students = 15;

    function renderHeatmap() {
        if (heatmapContainer.children.length > 0) return; // Already rendered
        
        concepts.forEach(concept => {
            const row = document.createElement('div');
            row.className = 'heatmap-row';
            
            const label = document.createElement('div');
            label.className = 'row-label';
            label.textContent = concept;
            
            const cells = document.createElement('div');
            cells.className = 'cells';
            
            for (let i = 0; i < students; i++) {
                const cell = document.createElement('div');
                // Random heat level 1-5 (weighted towards 3-5 for realism)
                const rand = Math.random();
                let heatLevel = 1;
                if (rand > 0.1) heatLevel = 2;
                if (rand > 0.3) heatLevel = 3;
                if (rand > 0.6) heatLevel = 4;
                if (rand > 0.85) heatLevel = 5;

                cell.className = `cell c-${heatLevel}`;
                cell.title = `Student ${i+1} - Mastery Level ${heatLevel}`;
                
                // Click to open intervention modal
                cell.addEventListener('click', () => openInterventionModal(concept, `Student ${i+1}`, heatLevel));
                
                cells.appendChild(cell);
            }
            
            row.appendChild(label);
            row.appendChild(cells);
            heatmapContainer.appendChild(row);
        });
    }

    // --- Intervention Modal ---
    const modal = document.getElementById('intervention-modal');
    const closeModalBtn = document.querySelector('.close-modal');
    const modalBody = document.getElementById('modal-body-content');
    const adjustBtns = document.querySelectorAll('.adjust-btn');

    function openInterventionModal(concept, student, level) {
        modalBody.innerHTML = `
            <p><strong>學生:</strong> ${student}</p>
            <p><strong>概念:</strong> ${concept}</p>
            <p><strong>目前狀態:</strong> Level ${level}</p>
            <hr style="border:0; border-top:1px solid var(--border-color); margin: 15px 0;">
            <p class="subtitle">根據此學生的學習狀況，您可以手動介入調整其學習軌跡：</p>
        `;
        modal.classList.remove('hidden');
    }

    closeModalBtn.addEventListener('click', () => modal.classList.add('hidden'));
    
    adjustBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = e.target.dataset.action;
            alert(`已對該學生執行指令: ${action}`);
            modal.classList.add('hidden');
        });
    });

    // --- AI Generator & Save Logic ---
    const genBtn = document.getElementById('btn-generate');
    const genResults = document.getElementById('gen-results');
    const saveActionArea = document.getElementById('save-action-area');
    const btnSaveQuestion = document.getElementById('btn-save-question');
    
    let currentGeneratedQuestions = []; // Store the array of drafted questions
    let currentConcept = '';
    let currentTier = '';

    genBtn.addEventListener('click', async () => {
        currentConcept = document.getElementById('gen-concept').value;
        currentTier = document.getElementById('gen-tier').value;
        const count = parseInt(document.getElementById('gen-count').value, 10) || 1;
        
        saveActionArea.classList.add('hidden');
        currentGeneratedQuestions = [];

        genResults.innerHTML = `
            <div class="loader"></div>
            <p style="text-align:center; color:var(--text-secondary);">AI 正在海量思考與出題中，請稍候（約需十幾秒）...</p>
        `;
        genBtn.disabled = true;

        try {
            const response = await fetch('/api/generate-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept: currentConcept, tier: currentTier, count: count })
            });
            
            const data = await response.json();
            
            if (data.success && data.data && data.data.length > 0) {
                currentGeneratedQuestions = data.data; // Save array to memory
                
                let allQuestionsHtml = '';
                data.data.forEach((q, qIndex) => {
                    let optionsHtml = '';
                    q.options.forEach((opt, idx) => {
                        const isCorrect = idx === q.answer;
                        optionsHtml += `<li class="${isCorrect ? 'correct' : ''}">${String.fromCharCode(65+idx)}. ${opt} ${isCorrect ? '✓' : ''}</li>`;
                    });

                    allQuestionsHtml += `
                        <div class="generated-q" style="margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 15px;">
                            <span class="badge" style="float:right;">Gemini 生成 #${qIndex + 1}</span>
                            <h4>${q.question}</h4>
                            <ul>${optionsHtml}</ul>
                            <div class="exp"><strong>詳解：</strong>${q.explanation}</div>
                        </div>
                    `;
                });

                genResults.innerHTML = allQuestionsHtml;
                btnSaveQuestion.textContent = `✅ 將這 ${data.data.length} 題全部儲存至題庫`;
                saveActionArea.classList.remove('hidden'); // Show save button
            } else {
                genResults.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">生成失敗: ${data.error || '未收到題目資料'}</div>`;
            }
        } catch (error) {
            genResults.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">發生連線錯誤: ${error.message}</div>`;
        } finally {
            genBtn.disabled = false;
        }
    });

    btnSaveQuestion.addEventListener('click', async () => {
        if (!currentGeneratedQuestions || currentGeneratedQuestions.length === 0) return;
        
        btnSaveQuestion.disabled = true;
        btnSaveQuestion.textContent = "批次儲存中...";
        
        try {
            // Append metadata to each question
            const payloadQuestions = currentGeneratedQuestions.map(q => ({
                concept: currentConcept,
                tier: currentTier,
                question: q.question,
                options: q.options,
                answer: q.answer,
                explanation: q.explanation
            }));
            
            const response = await fetch('/api/save-questions-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions: payloadQuestions })
            });
            
            const data = await response.json();
            if (data.success) {
                alert(`成功將 ${payloadQuestions.length} 題儲存至題庫！`);
                saveActionArea.classList.add('hidden'); // Hide after save
                genResults.innerHTML = `<div class="empty-state">已成功將題目儲存至題庫。您可以繼續設定並產生下一批題目。</div>`;
                loadQuestionBank(); // Refresh the list
            } else {
                alert("儲存失敗: " + data.error);
            }
        } catch (e) {
            alert("連線錯誤: " + e.message);
        } finally {
            btnSaveQuestion.disabled = false;
            btnSaveQuestion.innerHTML = "✅ 將這批題目全部儲存至題庫";
        }
    });

    // --- Feature 3: Load Question Bank ---
    const bankList = document.getElementById('bank-list');
    const bankFilterConcept = document.getElementById('bank-filter-concept');
    const bankFilterTier = document.getElementById('bank-filter-tier');
    let allBankQuestions = []; // Store globally for filtering

    async function loadQuestionBank() {
        try {
            const response = await fetch('/api/questions');
            const data = await response.json();
            
            if (data.success && data.data && data.data.length > 0) {
                allBankQuestions = data.data;
                
                // 提取所有獨立的 Concept 建立篩選器
                const concepts = [...new Set(allBankQuestions.map(q => q.concept))];
                const currentFilter = bankFilterConcept.value;
                
                bankFilterConcept.innerHTML = '<option value="ALL" style="color: #000; background: #fff;">顯示全部</option>';
                concepts.forEach(c => {
                    const option = document.createElement('option');
                    option.value = c;
                    option.textContent = c;
                    option.style.color = '#000';
                    option.style.background = '#fff';
                    if (c === currentFilter) option.selected = true;
                    bankFilterConcept.appendChild(option);
                });
                
                renderBankList();
            } else {
                bankList.innerHTML = `<div class="empty-state">目前題庫空空如也，快去產題並儲存吧！</div>`;
            }
        } catch (e) {
            bankList.innerHTML = `<div class="empty-state" style="color:var(--danger-color);">無法載入題庫: ${e.message}</div>`;
        }
    }

    bankFilterConcept.addEventListener('change', renderBankList);
    bankFilterTier.addEventListener('change', renderBankList);

    function renderBankList() {
        const filterConceptVal = bankFilterConcept.value;
        const filterTierVal = bankFilterTier.value;
        
        const filteredQ = allBankQuestions.filter(q => {
            const matchConcept = filterConceptVal === 'ALL' || q.concept === filterConceptVal;
            const matchTier = filterTierVal === 'ALL' || q.tier === filterTierVal;
            return matchConcept && matchTier;
        });
        
        const bankSidebar = document.getElementById('bank-sidebar');
        const bankToc = document.getElementById('bank-toc');

        if (filteredQ.length === 0) {
            bankList.innerHTML = `<div class="empty-state">此概念下沒有題目。</div>`;
            bankSidebar.style.display = 'none';
            return;
        }

        bankSidebar.style.display = 'block';

        let html = `
            <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px; padding-left: 5px;">
                <input type="checkbox" id="select-all-checkbox" style="width: 18px; height: 18px; cursor: pointer;" onchange="toggleSelectAll(this)">
                <label for="select-all-checkbox" style="font-size: 0.9rem; color: var(--text-secondary); cursor: pointer;">全選當前篩選的所有題目</label>
            </div>
        `;
        let tocHtml = '';
        
        filteredQ.forEach((q, index) => {
            let optionsHtml = '';
            q.options.forEach((opt, idx) => {
                const isCorrect = idx === q.answer;
                optionsHtml += `<li class="${isCorrect ? 'correct' : ''}">${String.fromCharCode(65+idx)}. ${opt} ${isCorrect ? '✓' : ''}</li>`;
            });

            // 跳脫 JSON 避免引號問題
            const qJson = JSON.stringify(q).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

            html += `
                <div class="generated-q" id="q-card-${q.id}" style="scroll-margin-top: 20px; display: flex; flex-direction: column; gap: 12px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" class="q-batch-checkbox" value="${q.id}" onchange="updateBatchDeleteBtn()" style="width: 18px; height: 18px; cursor: pointer;">
                            <span class="badge">${q.concept} | Tier: ${q.tier}</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn secondary" style="padding: 2px 8px; font-size: 0.8rem; white-space: nowrap;" onclick="editQuestion('${qJson}')">編輯 ✏️</button>
                            <button class="btn danger" style="padding: 2px 8px; font-size: 0.8rem; white-space: nowrap;" onclick="deleteQuestion(${q.id})">刪除 🗑️</button>
                        </div>
                    </div>
                    <h4 style="margin: 0; line-height: 1.4;">Q${index + 1}. ${q.question}</h4>
                    <ul style="margin: 0;">${optionsHtml}</ul>
                </div>
            `;
            
            // Generate TOC Item
            const shortQText = q.question.length > 20 ? q.question.substring(0, 20) + '...' : q.question;
            tocHtml += `
                <li style="cursor: pointer; padding: 6px 8px; border-radius: 4px; transition: background 0.2s;" 
                    onmouseover="this.style.background='rgba(255,255,255,0.1)'" 
                    onmouseout="this.style.background='transparent'"
                    onclick="document.getElementById('q-card-${q.id}').scrollIntoView({behavior: 'smooth'})">
                    <span style="color: var(--text-secondary); margin-right: 5px;">Q${index+1}.</span>
                    ${shortQText}
                </li>
            `;
        });
        
        bankList.innerHTML = html;
        bankToc.innerHTML = tocHtml;
    }

    // --- Feature 4: Edit Question ---
    window.editQuestion = (qJsonStr) => {
        // Unescape to parse
        const str = qJsonStr.replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        const q = JSON.parse(str);
        
        const card = document.getElementById(`q-card-${q.id}`);
        if (!card) return;

        let optionsInputs = '';
        q.options.forEach((opt, idx) => {
            optionsInputs += `
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <input type="radio" name="edit-answer-${q.id}" value="${idx}" ${idx === q.answer ? 'checked' : ''}>
                    <input type="text" id="edit-opt-${q.id}-${idx}" value="${opt}" class="form-control" style="flex: 1; padding: 4px;">
                </div>
            `;
        });

        card.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); padding: 15px; border-radius: 8px; border: 1px solid var(--primary-color);">
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 0.9rem; color: var(--text-secondary);">修改題目敘述：</label>
                    <textarea id="edit-q-text-${q.id}" class="form-control" style="width: 100%; padding: 8px; min-height: 60px;">${q.question}</textarea>
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="font-size: 0.9rem; color: var(--text-secondary);">修改選項與正確解答 (點選單選框)：</label>
                    ${optionsInputs}
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="font-size: 0.9rem; color: var(--text-secondary);">修改詳解：</label>
                    <textarea id="edit-q-exp-${q.id}" class="form-control" style="width: 100%; padding: 8px; min-height: 80px;">${q.explanation}</textarea>
                </div>
                <div style="text-align: right; gap: 10px; display: flex; justify-content: flex-end;">
                    <button class="btn secondary" onclick="loadQuestionBank()">取消</button>
                    <button class="btn primary" onclick="saveEditedQuestion(${q.id})">儲存修改</button>
                </div>
            </div>
        `;
    };

    window.saveEditedQuestion = async (qId) => {
        try {
            const newQText = document.getElementById(`edit-q-text-${qId}`).value;
            const newExp = document.getElementById(`edit-q-exp-${qId}`).value;
            
            const newOptions = [];
            let newAnswer = 0;
            for(let i=0; i<4; i++) {
                newOptions.push(document.getElementById(`edit-opt-${qId}-${i}`).value);
                const radio = document.querySelector(`input[name="edit-answer-${qId}"][value="${i}"]`);
                if(radio && radio.checked) newAnswer = i;
            }

            const payload = {
                question: newQText,
                options: newOptions,
                answer: newAnswer,
                explanation: newExp
            };

            const response = await fetch(`/api/questions/${qId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.success) {
                // Reload list
                loadQuestionBank();
            } else {
                alert("修改失敗：" + data.error);
            }
        } catch (e) {
            alert("連線錯誤：" + e.message);
        }
    };

    // --- Feature 5: Delete Questions ---
    window.deleteQuestion = async (qId) => {
        if (!confirm("確定要刪除這道題目嗎？此動作無法復原。")) return;
        try {
            const response = await fetch(`/api/questions/${qId}`, { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                loadQuestionBank();
                updateBatchDeleteBtn();
            } else {
                alert("刪除失敗：" + data.error);
            }
        } catch (e) {
            alert("連線錯誤：" + e.message);
        }
    };

    window.toggleSelectAll = (masterCheckbox) => {
        const checkboxes = document.querySelectorAll('.q-batch-checkbox');
        checkboxes.forEach(cb => cb.checked = masterCheckbox.checked);
        updateBatchDeleteBtn();
    };

    window.updateBatchDeleteBtn = () => {
        const checkboxes = document.querySelectorAll('.q-batch-checkbox');
        const checkedBoxes = document.querySelectorAll('.q-batch-checkbox:checked');
        const btn = document.getElementById('btn-batch-delete');
        const masterCb = document.getElementById('select-all-checkbox');
        
        if (masterCb && checkboxes.length > 0) {
            masterCb.checked = (checkboxes.length === checkedBoxes.length);
        }

        if (checkedBoxes.length > 0) {
            btn.classList.remove('hidden');
            btn.textContent = `🗑️ 批量刪除 (${checkedBoxes.length})`;
        } else {
            btn.classList.add('hidden');
        }
    };

    document.getElementById('btn-batch-delete').addEventListener('click', async () => {
        const checkboxes = document.querySelectorAll('.q-batch-checkbox:checked');
        if (checkboxes.length === 0) return;
        
        if (!confirm(`確定要刪除選中的 ${checkboxes.length} 道題目嗎？此動作無法復原。`)) return;

        const ids = Array.from(checkboxes).map(cb => parseInt(cb.value));
        
        try {
            const response = await fetch('/api/questions/batch-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: ids })
            });
            const data = await response.json();
            if (data.success) {
                loadQuestionBank();
                updateBatchDeleteBtn();
            } else {
                alert("批量刪除失敗：" + data.error);
            }
        } catch (e) {
            alert("連線錯誤：" + e.message);
        }
    });

});
