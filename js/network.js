/**
 * network.js - Gerenciador de Rede Multiplayer & Modos de Jogo
 * Modos: 'online' (Supabase Realtime Broadcast + Local BroadcastChannel), 'local' (2P Pass & Play), 'bot' (VS IA)
 */

import { supabaseManager } from './supabaseClient.js';

export class NetworkManager {
  constructor(game) {
    this.game = game;
    this.mode = 'local'; // 'online' | 'local' | 'bot'
    this.roomCode = null;
    this.isHost = true;
    this.channel = null;
    this.localChannel = null; // BroadcastChannel nativo do navegador para sincronização local instantânea
    this.localPlayerIndex = 0; // 0 para Time 1 (Home), 1 para Time 2 (Away)
    
    // Callbacks de UI
    this.onPlayerJoined = null;
    this.onGameStart = null;
    this.onChatMessage = null;
    this.onPlayerLeft = null;
    this.onStatusChange = null;

    this.joinPollInterval = null;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'local') {
      this.isHost = true;
      this.localPlayerIndex = 0;
    } else if (mode === 'bot') {
      this.isHost = true;
      this.localPlayerIndex = 0;
    }
  }

  // Gera código aleatório de 4 dígitos (ex: 7429)
  generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }

  // Cria uma nova sala
  async createRoom(roomCode, hostPlayerData, formation = 4) {
    this.mode = 'online';
    this.isHost = true;
    this.roomCode = roomCode;
    this.localPlayerIndex = 0;

    // Configura canal local do navegador (permite testar entre abas instantaneamente)
    try {
      if (this.localChannel) this.localChannel.close();
      this.localChannel = new BroadcastChannel(`futebol3d_bcast_${roomCode}`);
      this.localChannel.onmessage = (e) => this.handleIncomingMessage(e.data.event, e.data.payload);
    } catch (err) {
      console.warn('BroadcastChannel não suportado:', err);
    }

    // Configura canal Supabase Realtime para amigos pela internet
    const client = supabaseManager.getClient();
    if (client) {
      const channelName = `futebol3d_room_${roomCode}`;
      if (this.channel) {
        try { await this.channel.unsubscribe(); } catch (e) {}
      }

      this.channel = client.channel(channelName, {
        config: { broadcast: { ack: false } }
      });

      this.setupChannelListeners();

      // Inicia inscrição sem travar a interface
      this.channel.subscribe((status) => {
        console.log(`[Supabase Host] Status do canal ${roomCode}:`, status);
      });
    }

    return { success: true, roomCode };
  }

  // Entra em uma sala existente
  async joinRoom(roomCode, guestPlayerData) {
    this.mode = 'online';
    this.isHost = false;
    this.roomCode = roomCode;
    this.localPlayerIndex = 1;

    // Configura canal local do navegador
    try {
      if (this.localChannel) this.localChannel.close();
      this.localChannel = new BroadcastChannel(`futebol3d_bcast_${roomCode}`);
      this.localChannel.onmessage = (e) => this.handleIncomingMessage(e.data.event, e.data.payload);
    } catch (err) {
      console.warn('BroadcastChannel não suportado:', err);
    }

    // Configura canal Supabase Realtime
    const client = supabaseManager.getClient();
    if (client) {
      const channelName = `futebol3d_room_${roomCode}`;
      if (this.channel) {
        try { await this.channel.unsubscribe(); } catch (e) {}
      }

      this.channel = client.channel(channelName, {
        config: { broadcast: { ack: false } }
      });

      this.setupChannelListeners();

      this.channel.subscribe((status) => {
        console.log(`[Supabase Guest] Status do canal ${roomCode}:`, status);
        if (status === 'SUBSCRIBED') {
          this.sendBroadcast('guest_joined', { guest: guestPlayerData });
        }
      });
    }

    // Dispara sinal imediato no canal local e na rede
    this.sendBroadcast('guest_joined', { guest: guestPlayerData });

    // Envia sinal a cada 1.2s até receber handshake do Host
    if (this.joinPollInterval) clearInterval(this.joinPollInterval);
    let attempts = 0;
    this.joinPollInterval = setInterval(() => {
      attempts++;
      if (attempts > 8 || this.hasReceivedHandshake) {
        clearInterval(this.joinPollInterval);
        return;
      }
      this.sendBroadcast('guest_joined', { guest: guestPlayerData });
    }, 1200);

    return { success: true };
  }

  setupChannelListeners() {
    if (!this.channel) return;

    this.channel
      .on('broadcast', { event: 'guest_joined' }, ({ payload }) => {
        this.handleIncomingMessage('guest_joined', payload);
      })
      .on('broadcast', { event: 'host_handshake' }, ({ payload }) => {
        this.handleIncomingMessage('host_handshake', payload);
      })
      .on('broadcast', { event: 'start_match' }, ({ payload }) => {
        this.handleIncomingMessage('start_match', payload);
      })
      .on('broadcast', { event: 'player_shot' }, ({ payload }) => {
        this.handleIncomingMessage('player_shot', payload);
      })
      .on('broadcast', { event: 'sync_reset' }, ({ payload }) => {
        this.handleIncomingMessage('sync_reset', payload);
      })
      .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        this.handleIncomingMessage('chat_message', payload);
      })
      .on('broadcast', { event: 'player_left' }, ({ payload }) => {
        this.handleIncomingMessage('player_left', payload);
      });
  }

  handleIncomingMessage(event, payload) {
    if (event === 'guest_joined') {
      if (this.isHost && this.onPlayerJoined) {
        this.onPlayerJoined(payload.guest);
        // O Host responde com seus dados e a formação da partida
        const me = this.game ? this.game.players[0] : null;
        this.sendBroadcast('host_handshake', {
          host: me,
          formation: this.game ? this.game.formation : 4
        });
      }
    } else if (event === 'host_handshake') {
      if (!this.isHost && this.onPlayerJoined) {
        this.hasReceivedHandshake = true;
        if (this.joinPollInterval) clearInterval(this.joinPollInterval);
        this.onPlayerJoined(payload.host, payload.formation);
      }
    } else if (event === 'start_match') {
      if (this.onGameStart) {
        this.onGameStart(payload);
      }
    } else if (event === 'player_shot') {
      if (this.game) {
        this.game.applyRemoteShot(payload);
      }
    } else if (event === 'sync_reset') {
      if (this.game) {
        this.game.resetFieldPositions(payload.possessionTeam);
      }
    } else if (event === 'chat_message') {
      if (this.onChatMessage) {
        this.onChatMessage(payload);
      }
    } else if (event === 'player_left') {
      if (this.onPlayerLeft) {
        this.onPlayerLeft(payload);
      }
    }
  }

  async sendBroadcast(event, payload) {
    // 1. Envia via BroadcastChannel local (navegador)
    if (this.localChannel) {
      try {
        this.localChannel.postMessage({ event, payload });
      } catch (e) {}
    }

    // 2. Envia via Supabase Realtime (Internet)
    if (this.mode === 'online' && this.channel) {
      try {
        await this.channel.send({
          type: 'broadcast',
          event,
          payload
        });
      } catch (err) {
        console.warn('Erro ao enviar broadcast:', event, err);
      }
    }
  }

  // Dispara arremesso (shot)
  sendShot(pieceId, impulseX, impulseZ) {
    if (this.mode === 'online') {
      this.sendBroadcast('player_shot', {
        pieceId,
        impulseX,
        impulseZ,
        turnIndex: this.game.currentTurn
      });
    }
  }

  // Envia mensagem de chat
  sendChat(authorName, teamAbbr, teamColor, text) {
    const messageData = {
      authorName,
      teamAbbr,
      teamColor,
      text,
      timestamp: Date.now()
    };

    if (this.mode === 'online') {
      this.sendBroadcast('chat_message', messageData);
    }

    // Exibe na própria UI
    if (this.onChatMessage) {
      this.onChatMessage(messageData);
    }
  }

  // Notifica início de partida (Host envia para Guest)
  startOnlineMatch() {
    if (this.isHost && this.mode === 'online') {
      const matchConfig = {
        formation: this.game.formation,
        startTime: Date.now(),
        turn: 0
      };
      this.sendBroadcast('start_match', matchConfig);
      if (this.onGameStart) {
        this.onGameStart(matchConfig);
      }
    }
  }

  // Desconecta da sala
  leaveRoom() {
    if (this.joinPollInterval) clearInterval(this.joinPollInterval);
    if (this.localChannel) {
      try { this.localChannel.close(); } catch (e) {}
      this.localChannel = null;
    }
    if (this.channel) {
      this.sendBroadcast('player_left', { isHost: this.isHost });
      try { this.channel.unsubscribe(); } catch (e) {}
      this.channel = null;
    }
    this.roomCode = null;
    this.hasReceivedHandshake = false;
    this.mode = 'local';
  }

  // Checa se o jogador local pode jogar agora
  canLocalPlayerShoot(currentTurnIndex) {
    if (this.mode === 'local') {
      return true; // No mesmo PC, qualquer um joga quando é a sua vez
    }
    if (this.mode === 'bot') {
      return currentTurnIndex === 0; // Humano só joga no turno 0
    }
    if (this.mode === 'online') {
      return currentTurnIndex === this.localPlayerIndex;
    }
    return false;
  }
}
