import 'package:flutter_dotenv/flutter_dotenv.dart';

/// Chargement typé des variables d'environnement.
///
/// Doit être appelé une fois au démarrage après `dotenv.load()`.
class Env {
  static late final String supabaseUrl;
  static late final String supabaseAnonKey;
  static late final String mapboxToken;

  static void init() {
    supabaseUrl = _read('SUPABASE_URL');
    supabaseAnonKey = _read('SUPABASE_ANON_KEY');
    mapboxToken = _read('MAPBOX_TOKEN');
  }

  static String _read(String key) {
    final v = dotenv.env[key];
    if (v == null || v.isEmpty) {
      throw StateError('Env var $key is not set. Check your .env file.');
    }
    return v;
  }
}
