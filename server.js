// server.js (النسخة الكاملة والمحدثة)

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  }
});

// --- إضافة جديدة: جلب بيانات الأسئلة إلى الخادم ---
// الخادم هو من يجب أن يمتلك الأسئلة لضمان عدم الغش
const fullQuizData = [
    { statement: 'يُطْلَقُ مُصْطَلَحُ "الْمُسْنَدِ" وَيُرَادُ بِهِ مَعْنًى وَاحِدٌ فَقَطْ فِي عُلُومِ الْحَدِيثِ.', answer: 'incorrect', correction: 'يُطْلَقُ وَيُرَادُ بِهِ ثَلَاثَةُ مَعَانٍ (كِتَابٌ، إِسْنَادٌ، حَدِيثٌ مَرْفُوعٌ مُتَّصِلٌ).'},
    { statement: 'حَاصِلُ كَلَامِ النَّاظِمِ أَنَّ الْمُسْنَدَ يَجْمَعُ بَيْنَ أَمْرَيْنِ، وَهُمَا: الرَّفْعُ وَالِاتِّصَالُ.', answer: 'correct', correction: 'إِجَابَةٌ صَحِيحَةٌ! وَهُوَ قَوْلُ الْحَاكِمِ.'}
    // يمكنك إضافة كل أسئلتك هنا
];
const QUESTIONS_PER_GAME = 2; // عدد الأسئلة في كل لعبة منافسة

// ---------------------------------------------------

const gameRooms = {};

// دالة مساعدة لإرسال السؤال التالي
function sendQuestion(roomCode) {
    const room = gameRooms[roomCode];
    if (!room) return;

    const questionIndex = room.currentQuestionIndex;

    // التحقق إذا انتهت اللعبة
    if (questionIndex >= room.questions.length) {
        io.to(roomCode).emit('gameOver', { players: room.players });
        delete gameRooms[roomCode]; // تنظيف الغرفة بعد انتهاء اللعبة
        return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    const question = room.questions[questionIndex];

    // إرسال السؤال بدون الإجابة الصحيحة للعملاء
    const questionForClient = {
        statement: question.statement,
        questionNumber: questionIndex + 1,
        totalQuestions: room.questions.length,
        turn: currentPlayer.id // إعلام اللاعبين بمن عليه الدور
    };

    io.to(roomCode).emit('newQuestion', questionForClient);
}


io.on('connection', (socket) => {
    console.log('لاعب جديد متصل:', socket.id);

    socket.on('createGame', () => {
        const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        socket.join(roomCode);
        gameRooms[roomCode] = {
            players: [{ id: socket.id, score: 0 }],
            questions: [],
            currentQuestionIndex: 0,
            currentPlayerIndex: 0
        };
        socket.emit('gameCreated', { roomCode });
    });

    socket.on('joinGame', (data) => {
        const roomCode = data.roomCode;
        const room = gameRooms[roomCode];

        if (room && room.players.length < 2) {
            socket.join(roomCode);
            room.players.push({ id: socket.id, score: 0 });
            
            // --- إضافة جديدة: إعداد اللعبة عند انضمام اللاعب الثاني ---
            // خلط الأسئلة واختيار عدد محدد للعبة
            room.questions = [...fullQuizData].sort(() => 0.5 - Math.random()).slice(0, QUESTIONS_PER_GAME);
            room.currentQuestionIndex = 0;
            room.currentPlayerIndex = 0; // اللاعب الأول يبدأ دائماً
            // ---------------------------------------------------------

            io.to(roomCode).emit('gameStarted', { players: room.players, roomCode: roomCode });
            
            // إرسال السؤال الأول بعد فترة قصيرة
            setTimeout(() => {
                sendQuestion(roomCode);
            }, 2000); // انتظر ثانيتين بعد بدء اللعبة

        } else {
            socket.emit('error', { message: 'الغرفة غير موجودة أو ممتلئة' });
        }
    });

    // --- تعديل كبير: منطق التحقق من الإجابة ---
    socket.on('submitAnswer', (data) => {
        const { roomCode, statement, choice } = data;
        const room = gameRooms[roomCode];
        if (!room) return;
        
        // التأكد أن اللاعب الذي أجاب هو من عليه الدور
        const currentPlayer = room.players[room.currentPlayerIndex];
        if (socket.id !== currentPlayer.id) {
            return; // تجاهل الإجابة إذا لم يكن دوره
        }

        const question = room.questions[room.currentQuestionIndex];

        // التحقق من أن الإجابة للسؤال الصحيح
        if (question.statement !== statement) return;

        const isCorrect = (choice === question.answer);
        if (isCorrect) {
            currentPlayer.score++;
        }

        // إعلام كلا اللاعبين بنتيجة الإجابة
        io.to(roomCode).emit('answerResult', {
            isCorrect: isCorrect,
            correction: question.correction,
            players: room.players // إرسال النقاط المحدثة
        });
        
        // الانتقال للدور التالي والسؤال التالي
        room.currentQuestionIndex++;
        room.currentPlayerIndex = (room.currentPlayerIndex + 1) % 2; // تبديل الدور بين اللاعبين (0 و 1)

        // إرسال السؤال التالي بعد 3 ثوانٍ ليتمكن اللاعبون من رؤية النتيجة
        setTimeout(() => {
            sendQuestion(roomCode);
        }, 3000);
    });
    // ----------------------------------------------------

    socket.on('disconnect', () => {
        console.log('لاعب قطع الاتصال:', socket.id);
        // TODO: معالجة مغادرة لاعب
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
});