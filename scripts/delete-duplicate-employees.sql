-- Delete duplicate employees, keeping only the first one (by created_at)
-- This identifies employees with the same name and user_id, keeping the oldest entry

DELETE FROM employees
WHERE id NOT IN (
  SELECT MIN(id)
  FROM employees
  GROUP BY user_id, name
);
