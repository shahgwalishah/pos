create index register_shifts_opened_by_idx on public.register_shifts (opened_by);
create index register_shifts_closed_by_idx on public.register_shifts (closed_by) where closed_by is not null;
