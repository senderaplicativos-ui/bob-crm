
DELETE FROM instancias WHERE id = 'eeb95b2c-5652-4a2e-ba2d-7e6e7d201254';

ALTER TABLE instancias ADD CONSTRAINT unique_evolution_instance_name UNIQUE (evolution_instance_name);
