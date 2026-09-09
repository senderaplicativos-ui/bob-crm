export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cliques_rastreavel: {
        Row: {
          ad: string | null
          campaign: string | null
          click_id: string | null
          conversa_id: string | null
          criado_em: string | null
          id: string
          instancia_id: string | null
          source: string | null
          telefone_destino: string | null
          usado: boolean | null
        }
        Insert: {
          ad?: string | null
          campaign?: string | null
          click_id?: string | null
          conversa_id?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          source?: string | null
          telefone_destino?: string | null
          usado?: boolean | null
        }
        Update: {
          ad?: string | null
          campaign?: string | null
          click_id?: string | null
          conversa_id?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          source?: string | null
          telefone_destino?: string | null
          usado?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cliques_rastreavel_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliques_rastreavel_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          atualizado_em: string | null
          chave: string
          criado_em: string | null
          id: string
          valor: string | null
        }
        Insert: {
          atualizado_em?: string | null
          chave: string
          criado_em?: string | null
          id?: string
          valor?: string | null
        }
        Update: {
          atualizado_em?: string | null
          chave?: string
          criado_em?: string | null
          id?: string
          valor?: string | null
        }
        Relationships: []
      }
      conversas: {
        Row: {
          ad_body: string | null
          ad_headline: string | null
          ad_source_url: string | null
          anuncio: string | null
          atualizado_em: string | null
          campanha: string | null
          criado_em: string | null
          ctwa_clid: string | null
          id: string
          instancia_id: string | null
          is_grupo: boolean | null
          nome: string | null
          origem: string | null
          ref_code: string | null
          status: string | null
          telefone: string
          ultima_mensagem: string | null
        }
        Insert: {
          ad_body?: string | null
          ad_headline?: string | null
          ad_source_url?: string | null
          anuncio?: string | null
          atualizado_em?: string | null
          campanha?: string | null
          criado_em?: string | null
          ctwa_clid?: string | null
          id?: string
          instancia_id?: string | null
          is_grupo?: boolean | null
          nome?: string | null
          origem?: string | null
          ref_code?: string | null
          status?: string | null
          telefone: string
          ultima_mensagem?: string | null
        }
        Update: {
          ad_body?: string | null
          ad_headline?: string | null
          ad_source_url?: string | null
          anuncio?: string | null
          atualizado_em?: string | null
          campanha?: string | null
          criado_em?: string | null
          ctwa_clid?: string | null
          id?: string
          instancia_id?: string | null
          is_grupo?: boolean | null
          nome?: string | null
          origem?: string | null
          ref_code?: string | null
          status?: string | null
          telefone?: string
          ultima_mensagem?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      estagios_funil: {
        Row: {
          ativo: boolean | null
          cor: string | null
          criado_em: string | null
          id: string
          instancia_id: string | null
          nome: string
          ordem: number
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          nome: string
          ordem?: number
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          nome?: string
          ordem?: number
        }
        Relationships: [
          {
            foreignKeyName: "estagios_funil_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      instancias: {
        Row: {
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          evolution_api_key: string | null
          evolution_instance_name: string | null
          evolution_url: string | null
          id: string
          nome: string
          telefone_conectado: string | null
        }
        Insert: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          evolution_api_key?: string | null
          evolution_instance_name?: string | null
          evolution_url?: string | null
          id?: string
          nome: string
          telefone_conectado?: string | null
        }
        Update: {
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          evolution_api_key?: string | null
          evolution_instance_name?: string | null
          evolution_url?: string | null
          id?: string
          nome?: string
          telefone_conectado?: string | null
        }
        Relationships: []
      }
      links_rastreavel: {
        Row: {
          ad: string | null
          ativo: boolean | null
          campaign: string | null
          cliques: number | null
          criado_em: string | null
          id: string
          instancia_id: string | null
          mensagem_personalizada: string | null
          nome: string
          source: string
          url_gerada: string | null
        }
        Insert: {
          ad?: string | null
          ativo?: boolean | null
          campaign?: string | null
          cliques?: number | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          mensagem_personalizada?: string | null
          nome: string
          source: string
          url_gerada?: string | null
        }
        Update: {
          ad?: string | null
          ativo?: boolean | null
          campaign?: string | null
          cliques?: number | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          mensagem_personalizada?: string | null
          nome?: string
          source?: string
          url_gerada?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "links_rastreavel_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      log_erros: {
        Row: {
          criado_em: string | null
          detalhes: string | null
          id: string
          mensagem: string | null
          tipo: string
        }
        Insert: {
          criado_em?: string | null
          detalhes?: string | null
          id?: string
          mensagem?: string | null
          tipo?: string
        }
        Update: {
          criado_em?: string | null
          detalhes?: string | null
          id?: string
          mensagem?: string | null
          tipo?: string
        }
        Relationships: []
      }
      log_eventos_meta: {
        Row: {
          conversa_id: string | null
          criado_em: string | null
          estagio_origem: string | null
          evento_meta: string
          id: string
          instancia_id: string | null
          resposta: string | null
          status_resposta: number | null
          telefone: string | null
        }
        Insert: {
          conversa_id?: string | null
          criado_em?: string | null
          estagio_origem?: string | null
          evento_meta: string
          id?: string
          instancia_id?: string | null
          resposta?: string | null
          status_resposta?: number | null
          telefone?: string | null
        }
        Update: {
          conversa_id?: string | null
          criado_em?: string | null
          estagio_origem?: string | null
          evento_meta?: string
          id?: string
          instancia_id?: string | null
          resposta?: string | null
          status_resposta?: number | null
          telefone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "log_eventos_meta_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "log_eventos_meta_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      mapeamento_eventos: {
        Row: {
          ativo: boolean | null
          criado_em: string | null
          estagio_nome: string
          evento_meta: string
          id: string
          instancia_id: string
        }
        Insert: {
          ativo?: boolean | null
          criado_em?: string | null
          estagio_nome: string
          evento_meta: string
          id?: string
          instancia_id: string
        }
        Update: {
          ativo?: boolean | null
          criado_em?: string | null
          estagio_nome?: string
          evento_meta?: string
          id?: string
          instancia_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mapeamento_eventos_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens: {
        Row: {
          criado_em: string | null
          direcao: string | null
          id: string
          instancia_id: string | null
          mensagem: string | null
          telefone: string
        }
        Insert: {
          criado_em?: string | null
          direcao?: string | null
          id?: string
          instancia_id?: string | null
          mensagem?: string | null
          telefone: string
        }
        Update: {
          criado_em?: string | null
          direcao?: string | null
          id?: string
          instancia_id?: string | null
          mensagem?: string | null
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_config: {
        Row: {
          access_token: string
          ativo: boolean | null
          atualizado_em: string | null
          criado_em: string | null
          id: string
          instancia_id: string
          pixel_id: string
          test_event_code: string | null
        }
        Insert: {
          access_token: string
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          instancia_id: string
          pixel_id: string
          test_event_code?: string | null
        }
        Update: {
          access_token?: string
          ativo?: boolean | null
          atualizado_em?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string
          pixel_id?: string
          test_event_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_config_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: true
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
      regras: {
        Row: {
          ativo: boolean | null
          cor: string | null
          criado_em: string | null
          id: string
          instancia_id: string | null
          modo: string
          resultado: string
          texto: string
          tipo_regra: string
        }
        Insert: {
          ativo?: boolean | null
          cor?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          modo: string
          resultado: string
          texto: string
          tipo_regra: string
        }
        Update: {
          ativo?: boolean | null
          cor?: string | null
          criado_em?: string | null
          id?: string
          instancia_id?: string | null
          modo?: string
          resultado?: string
          texto?: string
          tipo_regra?: string
        }
        Relationships: [
          {
            foreignKeyName: "regras_instancia_id_fkey"
            columns: ["instancia_id"]
            isOneToOne: false
            referencedRelation: "instancias"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
