/**
 * supabaseClient.js - Gerenciador do Cliente Supabase
 * Credenciais oficiais pré-configuradas e fixas para multiplayer imediato no GitHub Pages.
 */

// Credenciais fixas oficiais do projeto
const SUPABASE_URL = 'https://udcamqxevdrmrpwmuukz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_PLZ5XWIaIPsrD8jbp5250g_kdKlrvvi';

class SupabaseManager {
  constructor() {
    this.client = null;
    this.url = SUPABASE_URL;
    this.anonKey = SUPABASE_KEY;
    this.initClient();
  }

  initClient() {
    if (this.url && this.anonKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.url, this.anonKey, {
          realtime: {
            params: {
              eventsPerSecond: 25
            }
          }
        });
      } catch (err) {
        console.warn('Erro ao inicializar cliente Supabase:', err);
        this.client = null;
      }
    }
  }

  getCredentials() {
    return {
      url: this.url,
      anonKey: this.anonKey
    };
  }

  isConfigured() {
    return !!(this.client && this.url && this.anonKey);
  }

  async testConnection() {
    if (!this.isConfigured()) {
      return { success: false, message: 'Supabase não inicializado.' };
    }
    try {
      const testChannel = this.client.channel('ping_test_' + Date.now());
      let connected = false;

      const promise = new Promise((resolve) => {
        testChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            connected = true;
            resolve({ success: true, message: '🟢 Supabase Realtime conectado com sucesso!' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve({ success: false, message: 'Falha na conexão: ' + status });
          }
        });

        setTimeout(() => {
          if (!connected) {
            resolve({ success: false, message: 'Tempo limite ao conectar.' });
          }
        }, 5000);
      });

      const res = await promise;
      testChannel.unsubscribe();
      return res;
    } catch (err) {
      return { success: false, message: 'Erro: ' + (err.message || err) };
    }
  }
}

export const supabaseManager = new SupabaseManager();
