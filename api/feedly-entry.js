export default async function handler(req, res) {
  const { id } = req.query;

  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!id) {
    return res.status(400).json({ error: 'ID é obrigatório' });
  }

  try {
    const response = await fetch(
      `https://api.feedly.com/v3/entries/${encodeURIComponent(id)}`
    );

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Item não encontrado no Feedly' });
    }

    const data = await response.json();
    const item = Array.isArray(data) ? data[0] : data;

    if (!item?.id) {
      return res.status(404).json({ error: 'Item não encontrado no Feedly' });
    }

    return res.status(200).json(item);
  } catch (error) {
    return res.status(500).json({ error: 'Falha ao buscar item no Feedly' });
  }
}
