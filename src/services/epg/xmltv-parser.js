function parseDate(value = '') {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
}

export function parseXmltv(xmlText = '') {
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(xmlText, 'text/xml');

  const channels = Array.from(documentNode.querySelectorAll('channel')).map((channel) => ({
    id: channel.getAttribute('id') || '',
    names: Array.from(channel.querySelectorAll('display-name')).map((node) => node.textContent?.trim())
  }));

  const programmes = Array.from(documentNode.querySelectorAll('programme')).map((programme) => ({
    channel: programme.getAttribute('channel') || '',
    start: parseDate(programme.getAttribute('start') || ''),
    stop: parseDate(programme.getAttribute('stop') || ''),
    title: programme.querySelector('title')?.textContent?.trim() || 'Program',
    description: programme.querySelector('desc')?.textContent?.trim() || ''
  }));

  return {
    channels,
    programmes
  };
}
