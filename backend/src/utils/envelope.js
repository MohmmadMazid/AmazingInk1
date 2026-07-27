/** Standard response envelope: { success, data, meta } — matches the original platform contract
 *  so the frontend api clients can `unwrap` responses the same way. */
export const ok = (res, data, meta) => res.json(meta ? { success: true, data, meta } : { success: true, data });

export const created = (res, data) => res.status(201).json({ success: true, data });

export const paginated = (res, data, { total, page, limit }) =>
  res.json({ success: true, data, meta: { total, page, limit, pages: Math.ceil(total / limit) } });

/** Parse pagination query params with a hard ceiling. */
export const pageParams = (query, maxLimit = 200) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(query.limit) || 25));
  return { page, limit, skip: (page - 1) * limit };
};
