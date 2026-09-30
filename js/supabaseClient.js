/**
 * supabaseClient.js - Gerenciador do Cliente Supabase
 * Suporta configuração via localStorage ou defaults amigáveis
 */

const STORAGE_KEY_URL = 'futebol3d_sb_url';
const STORAGE_KEY_KEY = 'futebol3d_sb_key';

class SupabaseManager {
  constructor() {
    this.client = null;
    this.url = localStorage.getItem(STORAGE_KEY_URL) || '';
    this.anonKey = localStorage.getItem(STORAGE_KEY_KEY) || '';
    this.initClient();
  }

  initClient() {
    if (this.url && this.anonKey && window.supabase) {
      try {
        this.client = window.supabase.createClient(this.url, this.anonKey, {
          realtime: {
            params: {
              eventsPerSecond: 20
            }
          }
        });
      } catch (err) {
        console.warn('Erro ao inicializar cliente Supabase:', err);
        this.client = null;
      }
    }
  }

  saveCredentials(url, anonKey) {
    this.url = (url || '').trim();
    this.anonKey = (anonKey || '').trim();
    localStorage.setItem(STORAGE_KEY_URL, this.url);
    localStorage.setItem(STORAGE_KEY_KEY, this.anonKey);
    this.initClient();
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
      return { success: false, message: 'URL e Anon Key precisam ser preenchidos.' };
    }
    try {
      // Cria um canal de teste rápido
      const testChannel = this.client.channel('ping_test_' + Date.now());
      let connected = false;

      const promise = new Promise((resolve) => {
        testChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            connected = true;
            resolve({ success: true, message: 'Conexão com Supabase Realtime estabelecida com sucesso!' });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve({ success: false, message: 'Falha ao conectar: ' + status });
          }
        });

        setTimeout(() => {
          if (!connected) {
            resolve({ success: false, message: 'Tempo limite esgotado ao conectar no Supabase.' });
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
