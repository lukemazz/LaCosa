// backend/index.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

// Import dei modelli
const Game = require('./models/Game');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());

// Connessione a MongoDB
mongoose.connect('mongodb://localhost:27017/thething', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('MongoDB connesso'))
  .catch((err) => console.error(err));

// Funzione di utilità per generare un mazzo di carte
function generateDeck() {
  const deck = [];
  // Carte azione
  const actionCards = ['Riparare la base', 'Cercare nei magazzini', 'Sabotare segretamente', 'Attaccare un giocatore'];
  // Carte equipaggiamento
  const equipmentCards = ['Lanciafiamme', 'Armi da fuoco', 'Torcia', 'Strumenti di riparazione'];
  // Carte test del sangue ed evento
  const bloodTestCards = ['Test del sangue'];
  const eventCards = ['Evento imprevisto'];

  // Aggiunge più copie di ogni carta per semplicità
  actionCards.forEach(card => {
    for (let i = 0; i < 3; i++) {
      deck.push({ type: 'azione', name: card });
    }
  });
  equipmentCards.forEach(card => {
    for (let i = 0; i < 2; i++) {
      deck.push({ type: 'equipaggiamento', name: card });
    }
  });
  bloodTestCards.forEach(card => {
    for (let i = 0; i < 2; i++) {
      deck.push({ type: 'test', name: card });
    }
  });
  eventCards.forEach(card => {
    for (let i = 0; i < 2; i++) {
      deck.push({ type: 'evento', name: card });
    }
  });

  // Mischia il mazzo
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Endpoint per creare una partita
app.post('/api/games', async (req, res) => {
  try {
    const gameData = req.body;
    const game = new Game({
      name: gameData.name,
      status: 'waiting',
      players: [],
      deck: [],
      discardPile: [],
      state: {
        currentTurn: 0,
        baseHealth: 0,
      },
    });
    await game.save();
    res.status(201).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint per unirsi a una partita
app.post('/api/games/:gameId/join', async (req, res) => {
  const { username } = req.body;
  const { gameId } = req.params;
  try {
    let game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Partita non trovata' });
    }
    // Se il giocatore è già nella partita, ritorna errore
    if (game.players.some(p => p.username === username)) {
      return res.status(400).json({ error: 'Giocatore già presente' });
    }
    game.players.push({ username, role: '', hand: [] });
    await game.save();
    res.status(200).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint per iniziare la partita
app.post('/api/games/:gameId/start', async (req, res) => {
  const { gameId } = req.params;
  try {
    let game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Partita non trovata' });
    }
    if (game.players.length < 3) {
      return res.status(400).json({ error: 'Numero di giocatori insufficiente' });
    }
    // Assegna i ruoli: se ci sono almeno 6 giocatori, 2 diventano "La Cosa", altrimenti 1
    const numPlayers = game.players.length;
    const numCosa = numPlayers >= 6 ? 2 : 1;
    const indices = [];
    while (indices.length < numCosa) {
      const randIndex = Math.floor(Math.random() * numPlayers);
      if (!indices.includes(randIndex)) {
        indices.push(randIndex);
      }
    }
    game.players.forEach((player, index) => {
      player.role = indices.includes(index) ? 'La Cosa' : 'Umano';
    });
    // Genera il mazzo e distribuisce 5 carte per giocatore
    game.deck = generateDeck();
    game.players.forEach(player => {
      player.hand = game.deck.splice(0, 5);
    });
    game.status = 'in-progress';
    await game.save();
    // Notifica tutti i client collegati via Socket.IO
    io.to(gameId).emit('gameStarted', { game });
    res.status(200).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint per inviare una mossa (fallback REST)
app.post('/api/games/:gameId/move', async (req, res) => {
  const { gameId } = req.params;
  const { username, move } = req.body;
  try {
    let game = await Game.findById(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Partita non trovata' });
    }
    // Logica semplificata: per una mossa di tipo "azione" si rimuove la carta dalla mano
    const player = game.players.find(p => p.username === username);
    if (!player) {
      return res.status(404).json({ error: 'Giocatore non trovato' });
    }
    if (move.type === 'azione') {
      const cardIndex = player.hand.findIndex(card => card.name === move.cardName);
      if (cardIndex === -1) {
        return res.status(400).json({ error: 'Carta non trovata in mano' });
      }
      const playedCard = player.hand.splice(cardIndex, 1)[0];
      game.discardPile.push(playedCard);
      // Effetto semplificato: se la carta è "Riparare la base", incrementa baseHealth
      if (playedCard.name === 'Riparare la base') {
        game.state.baseHealth = (game.state.baseHealth || 0) + 1;
      }
    }
    // Passa il turno al giocatore successivo
    game.state.currentTurn = (game.state.currentTurn + 1) % game.players.length;
    await game.save();
    io.to(gameId).emit('moveMade', { username, move, gameState: game.state });
    res.status(200).json(game);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Creazione del server HTTP e configurazione di Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' },
});

// Gestione degli eventi Socket.IO
io.on('connection', (socket) => {
  console.log('Nuovo client connesso:', socket.id);

  // Unirsi a una stanza di gioco
  socket.on('joinGame', async ({ gameId, username }) => {
    socket.join(gameId);
    io.to(gameId).emit('playerJoined', { username });
    console.log(`${username} è entrato nella partita ${gameId}`);
  });

  // Iniziare la partita (stessa logica dell’endpoint REST /start)
  socket.on('startGame', async ({ gameId }) => {
    try {
      let game = await Game.findById(gameId);
      if (!game) return;
      if (game.status !== 'waiting') return;
      const numPlayers = game.players.length;
      const numCosa = numPlayers >= 6 ? 2 : 1;
      const indices = [];
      while (indices.length < numCosa) {
        const randIndex = Math.floor(Math.random() * numPlayers);
        if (!indices.includes(randIndex)) indices.push(randIndex);
      }
      game.players.forEach((player, index) => {
        player.role = indices.includes(index) ? 'La Cosa' : 'Umano';
      });
      game.deck = generateDeck();
      game.players.forEach(player => {
        player.hand = game.deck.splice(0, 5);
      });
      game.status = 'in-progress';
      await game.save();
      io.to(gameId).emit('gameStarted', { game });
    } catch (err) {
      console.error(err);
    }
  });

  // Gestione delle mosse via Socket.IO
  socket.on('gameMove', async (data) => {
    const { gameId, username, move } = data;
    try {
      let game = await Game.findById(gameId);
      if (!game) return;
      const player = game.players.find(p => p.username === username);
      if (!player) return;
      if (move.type === 'azione') {
        const cardIndex = player.hand.findIndex(card => card.name === move.cardName);
        if (cardIndex !== -1) {
          const playedCard = player.hand.splice(cardIndex, 1)[0];
          game.discardPile.push(playedCard);
          if (playedCard.name === 'Riparare la base') {
            game.state.baseHealth = (game.state.baseHealth || 0) + 1;
          }
        }
      }
      // Passa il turno
      game.state.currentTurn = (game.state.currentTurn + 1) % game.players.length;
      await game.save();
      io.to(gameId).emit('moveMade', { username, move, gameState: game.state });
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnesso:', socket.id);
  });
});

// Avvio del server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server in ascolto sulla porta ${PORT}`);
});
