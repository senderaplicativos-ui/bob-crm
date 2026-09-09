DELETE FROM instancias WHERE id NOT IN (
  SELECT DISTINCT ON (evolution_instance_name) id
  FROM instancias
  ORDER BY evolution_instance_name, criado_em ASC
);