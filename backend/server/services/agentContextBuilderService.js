function buildMemoryMap(memoryItems = []) {
  return (Array.isArray(memoryItems) ? memoryItems : []).reduce((acc, item) => {
    if (item?.memory_key) acc[item.memory_key] = item.value;
    return acc;
  }, {});
}

async function buildContext({ input = {}, session = null } = {}) {
  const memory = buildMemoryMap(session?.memory || []);
  const summary = session?.summary || {};

  return {
    range:
      input?.context?.range?.desde || input?.context?.range?.hasta
        ? input.context.range
        : summary.active_range || memory.active_range || { desde: null, hasta: null },
    filters:
      Object.keys(input?.context?.filters || {}).length > 0
        ? input.context.filters
        : summary.active_filters || memory.active_filters || {},
    detail_target:
      input?.context?.detail_target || summary.active_detail_target || memory.active_detail_target || null,
    active_entity:
      input?.context?.active_entity || summary.active_entity || memory.active_entity || null,
    session_summary: summary,
    memory,
  };
}

module.exports = {
  buildContext,
};
