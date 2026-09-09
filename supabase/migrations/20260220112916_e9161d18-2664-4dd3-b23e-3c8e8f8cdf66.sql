INSERT INTO instancias (nome, telefone_conectado, evolution_url, evolution_api_key, evolution_instance_name)
VALUES ('Bob Corretor (Teste Imob)', '5519982569851', 'https://chatevo.atende.app.br', 'd68048fb02ba896f898888a8704467d2', 'Imobteste');

UPDATE conversas SET instancia_id = (SELECT id FROM instancias WHERE evolution_instance_name = 'Imobteste') WHERE instancia_id IS NULL;
UPDATE mensagens SET instancia_id = (SELECT id FROM instancias WHERE evolution_instance_name = 'Imobteste') WHERE instancia_id IS NULL;
UPDATE regras SET instancia_id = (SELECT id FROM instancias WHERE evolution_instance_name = 'Imobteste') WHERE instancia_id IS NULL;