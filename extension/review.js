// AniList scores use the connected account's chosen scale.
export function scoreOptions(format) {
  const options = {
    POINT_100: { max:100, step:1, label:'Score / 100' },
    POINT_10_DECIMAL: { max:10, step:0.1, label:'Score / 10' },
    POINT_10: { max:10, step:1, label:'Score / 10' },
    POINT_5: { max:5, step:1, label:'Score / 5 stars' },
    POINT_3: { max:3, step:1, label:'Score', choices:['No score','🙁','😐','🙂'] }
  };
  if (!options[format]) throw new Error('Unable to read your AniList score format. Retry loading the review.');
  return { format, ...options[format] };
}
export function validateScore(value, format) {
  const {max,step} = scoreOptions(format);
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || Math.abs(value/step-Math.round(value/step)) > 0.00001)
    throw new Error(`Enter a score from 0 to ${max} in steps of ${step}.`);
  return value;
}

// Follow every prequel branch once, even if the relation graph contains cycles.
export async function reviewHistory(mediaId, fetchMedia) {
  const visited = new Set(), queue = [mediaId], prequels = [];
  let current;
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const media = await fetchMedia(id);
    if (!media) throw new Error('Unable to load prequel details. Retry shortly.');
    if (id === mediaId) current = media; else prequels.push(media);
    for (const edge of media.relations?.edges || []) {
      if (edge.relationType === 'PREQUEL' && edge.node?.type === 'ANIME' && !visited.has(edge.node.id)) queue.push(edge.node.id);
    }
  }
  return { current, prequels };
}
