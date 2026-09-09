UPDATE conversas SET status = 'PAGOU' WHERE status = 'PAGO';
UPDATE conversas SET status = 'LEAD' WHERE status IN ('AGENDAMENTO', 'PEDIU VALORES');