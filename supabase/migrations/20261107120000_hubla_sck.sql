-- Hubla: o indexador passa do utm_term para o sck, como no container do sGTM
-- (Containers/Hubla.json lê invoice.paymentSession.params.sck).
-- Só mexe nas áreas que estavam com a Hubla no utm_term.
UPDATE public.workspaces
   SET tracking_param = 'sck'
 WHERE tracking_platform = 'hubla'
   AND tracking_param = 'utm_term';
