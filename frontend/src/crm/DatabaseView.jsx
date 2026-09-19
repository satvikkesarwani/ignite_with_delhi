import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ArrowUpDown, ArrowUp, ArrowDown, X, RotateCcw } from 'lucide-react';
import { api } from './api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ProfileDrawer, PERSONA_TONE, STATUS_TONE } from './ProfileDrawer';
import { cn } from '@/lib/utils';

function EngagementCell({ value }) {
  const num = typeof value === 'number' ? value : 0;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-[3px] w-10 shrink-0 bg-border-strong">
        <div
          className="h-full bg-accent transition-all duration-100"
          style={{ width: `${Math.min(100, Math.max(0, num))}%` }}
        />
      </div>
      <span className="crm-num w-5 text-right text-[11.5px] text-text font-medium">{num}</span>
    </div>
  );
}

export function DatabaseView() {
  const [candidates, setCandidates] = useState([]);
  const [facets, setFacets] = useState({ colleges: [], skills: [], personas: [], statuses: [] });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Search, Filters, Sorting & Pagination
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [collegeFilter, setCollegeFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [personaFilter, setPersonaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortKey, setSortKey] = useState('engagement');
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);
  const limit = 50;

  // Drawer selection from URL query or click
  const [selectedUserId, setSelectedUserId] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('id') || null;
    }
    return null;
  });

  const [focusedIndex, setFocusedIndex] = useState(0);
  const tableRef = useRef(null);

  // Sync selectedUserId to URL
  const selectUser = (id) => {
    setSelectedUserId(id);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (id) {
        url.searchParams.set('id', id);
      } else {
        url.searchParams.delete('id');
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  // Debounce search input by 150ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 150);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch candidates from API asynchronously inside effect
  useEffect(() => {
    let ignore = false;
    const ctrl = new AbortController();

    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (collegeFilter) params.set('college', collegeFilter);
    if (skillFilter) params.set('skill', skillFilter);
    if (personaFilter) params.set('persona', personaFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('limit', String(limit));
    params.set('offset', String((page - 1) * limit));

    api(`/api/crm/candidates?${params.toString()}`, { signal: ctrl.signal })
      .then((res) => {
        if (!ignore) {
          setCandidates(res.rows || []);
          setTotal(res.total || 0);
          if (res.facets) {
            setFacets(res.facets);
          }
          setLoading(false);
          setError(null);
        }
      })
      .catch((err) => {
        if (!ignore && err.name !== 'AbortError') {
          setError(err);
          setCandidates([]);
          setTotal(0);
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
      ctrl.abort();
    };
  }, [debouncedSearch, collegeFilter, skillFilter, personaFilter, statusFilter, page]);

  // Client-side filtering fallback and sorting
  const filteredAndSortedRows = useMemo(() => {
    let list = [...candidates];

    if (collegeFilter) {
      list = list.filter((r) => r.college?.toLowerCase().includes(collegeFilter.toLowerCase()));
    }
    if (skillFilter) {
      list = list.filter((r) =>
        r.top_skills?.some((s) => s.toLowerCase().includes(skillFilter.toLowerCase()))
      );
    }
    if (personaFilter) {
      list = list.filter((r) => r.personas?.includes(personaFilter));
    }
    if (statusFilter) {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r.full_name?.toLowerCase().includes(q) ||
          r.email?.toLowerCase().includes(q) ||
          r.college?.toLowerCase().includes(q) ||
          r.user_id?.toLowerCase().includes(q) ||
          r.top_skills?.some((s) => s.toLowerCase().includes(q))
      );
    }

    list.sort((a, b) => {
      let va = a[sortKey];
      let vb = b[sortKey];

      if (sortKey === 'full_name' || sortKey === 'college') {
        va = (va || '').toLowerCase();
        vb = (vb || '').toLowerCase();
        return sortOrder === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }

      if (sortKey === 'last_active') {
        va = va ? new Date(va).getTime() : 0;
        vb = vb ? new Date(vb).getTime() : 0;
      } else {
        va = typeof va === 'number' ? va : 0;
        vb = typeof vb === 'number' ? vb : 0;
      }

      return sortOrder === 'asc' ? va - vb : vb - va;
    });

    return list;
  }, [
    candidates,
    collegeFilter,
    skillFilter,
    personaFilter,
    statusFilter,
    debouncedSearch,
    sortKey,
    sortOrder,
  ]);

  // Keyboard navigation: j/k move, Enter opens, Esc closes
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (selectedUserId) return; // Drawer handles Esc

      const rowCount = filteredAndSortedRows.length;
      if (rowCount === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(rowCount - 1, prev + 1));
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        const row = filteredAndSortedRows[focusedIndex];
        if (row) {
          e.preventDefault();
          selectUser(row.user_id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedUserId, filteredAndSortedRows, focusedIndex]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('desc');
    }
  };

  const hasActiveFilters = Boolean(
    debouncedSearch || collegeFilter || skillFilter || personaFilter || statusFilter
  );

  const resetAllFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setCollegeFilter('');
    setSkillFilter('');
    setPersonaFilter('');
    setStatusFilter('');
    setPage(1);
    setFocusedIndex(0);
  };

  const startRecord = Math.min((page - 1) * limit + 1, total);
  const endRecord = Math.min(page * limit, total);

  return (
    <div className="space-y-3.5 pt-1">
      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Search Input */}
        <div className="relative min-w-[240px] max-w-[320px] flex-1">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, college, skill..."
            className="pl-8 text-[12px] h-7.5"
          />
          <Search size={13} className="absolute left-2.5 top-2.5 text-faint" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-2 text-faint hover:text-text"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Filter Dropdowns: plain bordered selects */}
        <select
          value={collegeFilter}
          onChange={(e) => {
            setCollegeFilter(e.target.value);
            setPage(1);
          }}
          className="h-7.5 rounded border border-border bg-surface px-2 text-[11.5px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:outline-none"
        >
          <option value="">All Colleges</option>
          {facets.colleges?.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>

        <select
          value={skillFilter}
          onChange={(e) => {
            setSkillFilter(e.target.value);
            setPage(1);
          }}
          className="h-7.5 rounded border border-border bg-surface px-2 text-[11.5px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:outline-none"
        >
          <option value="">All Skills</option>
          {facets.skills?.slice(0, 30).map((s) => (
            <option key={s.value} value={s.value}>
              {s.value} ({s.count})
            </option>
          ))}
        </select>

        <select
          value={personaFilter}
          onChange={(e) => {
            setPersonaFilter(e.target.value);
            setPage(1);
          }}
          className="h-7.5 rounded border border-border bg-surface px-2 text-[11.5px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:outline-none"
        >
          <option value="">All Personas</option>
          {facets.personas?.map((p) => (
            <option key={p.value} value={p.value}>
              {p.value} ({p.count})
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-7.5 rounded border border-border bg-surface px-2 text-[11.5px] text-text hover:border-border-strong focus-visible:border-accent focus-visible:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="cooling">Cooling</option>
          <option value="dormant">Dormant</option>
          <option value="lapsed">Lapsed</option>
        </select>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={resetAllFilters}
            className="h-7.5 px-2 text-[11.5px] text-muted hover:text-text gap-1"
          >
            <RotateCcw size={11} />
            <span>Reset</span>
          </Button>
        )}

        {/* Counter & Keyboard hint */}
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-[11px] text-faint xl:inline-block">
            <span className="crm-num text-muted">j</span>/
            <span className="crm-num text-muted">k</span> row ·{' '}
            <span className="crm-num text-muted">Enter</span> profile
          </span>
          <span className="crm-num text-[11.5px] text-muted">
            {loading
              ? 'Loading…'
              : total > 0
                ? `${startRecord}–${endRecord} of ${total}`
                : '0 results'}
          </span>
        </div>
      </div>

      {/* Error state: Names endpoint cleanly */}
      {error && (
        <div className="border border-danger/60 bg-danger/5 px-4 py-3 text-[13px] text-danger">
          <span className="crm-num font-mono text-[11px] uppercase tracking-[0.1em]">
            GET /api/crm/candidates Failed
          </span>
          <p className="mt-1 text-text">{error.message || 'Could not query candidate directory'}</p>
        </div>
      )}

      {/* Primary Table Surface: 32px rows, sticky header, hairline borders, zebra at 2% */}
      <div className="border border-border bg-surface/30">
        <table ref={tableRef} className="crm-table w-full text-left table-fixed">
          <thead className="sticky top-0 z-10 border-b border-border-strong bg-bg text-[10.5px] uppercase tracking-[0.08em] text-muted">
            <tr>
              <th
                onClick={() => handleSort('full_name')}
                className="w-[19%] cursor-pointer py-2 pl-3.5 pr-2 font-medium transition-colors hover:text-text select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Person</span>
                  {sortKey === 'full_name' ? (
                    sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="text-faint" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('college')}
                className="w-[14%] cursor-pointer py-2 px-2 font-medium transition-colors hover:text-text select-none"
              >
                <div className="flex items-center gap-1">
                  <span>College</span>
                  {sortKey === 'college' ? (
                    sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="text-faint" />
                  )}
                </div>
              </th>
              <th className="w-[17%] py-2 px-2 font-medium">Personas</th>
              <th className="w-[15%] py-2 px-2 font-medium">Top Skills</th>
              <th
                onClick={() => handleSort('hackathons_attended')}
                className="w-[6.5%] cursor-pointer py-2 px-1.5 text-right font-medium transition-colors hover:text-text select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Events</span>
                  {sortKey === 'hackathons_attended' ? (
                    sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="text-faint" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('prize_count')}
                className="w-[6%] cursor-pointer py-2 px-1.5 text-right font-medium transition-colors hover:text-text select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Wins</span>
                  {sortKey === 'prize_count' ? (
                    sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="text-faint" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('engagement')}
                className="w-[9.5%] cursor-pointer py-2 px-2 text-right font-medium transition-colors hover:text-text select-none"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Score</span>
                  {sortKey === 'engagement' ? (
                    sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="text-faint" />
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('last_active')}
                className="w-[8%] cursor-pointer py-2 px-1.5 font-medium transition-colors hover:text-text select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Active</span>
                  {sortKey === 'last_active' ? (
                    sortOrder === 'asc' ? (
                      <ArrowUp size={11} />
                    ) : (
                      <ArrowDown size={11} />
                    )
                  ) : (
                    <ArrowUpDown size={10} className="text-faint" />
                  )}
                </div>
              </th>
              <th className="w-[7%] py-2 pl-1.5 pr-3 text-right font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 14 }).map((_, i) => (
                <tr key={i} className="h-8 border-b border-border">
                  <td colSpan={9} className="px-3.5 py-1">
                    <div
                      className="crm-skeleton h-3"
                      style={{ width: `${55 + ((i * 13) % 40)}%` }}
                    />
                  </td>
                </tr>
              ))
            ) : filteredAndSortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center">
                  <div className="text-[13px] text-muted">
                    No participants found matching the current filters.
                  </div>
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetAllFilters}
                      className="mt-3 text-[12px]"
                    >
                      Clear all filters
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((r, index) => {
                const isSelected = selectedUserId === r.user_id;
                const isFocused = focusedIndex === index;

                return (
                  <tr
                    key={r.user_id}
                    onClick={() => {
                      setFocusedIndex(index);
                      selectUser(r.user_id);
                    }}
                    tabIndex={0}
                    onFocus={() => setFocusedIndex(index)}
                    className={cn(
                      'h-8 cursor-pointer border-b border-border transition-colors duration-100 outline-none',
                      'hover:bg-surface',
                      isFocused && 'bg-surface-2 ring-1 ring-accent/40',
                      isSelected && 'bg-surface-2 border-accent/60'
                    )}
                  >
                    {/* Person: Name in Plex Sans, user_id in mono 10.5px, compact */}
                    <td className="py-1 pl-3.5 pr-2 truncate">
                      <div className="flex items-baseline gap-1.5 truncate">
                        <span className="text-[12.5px] font-medium text-text truncate">
                          {r.full_name?.trim()}
                        </span>
                        <span className="crm-num text-[10.5px] text-faint shrink-0">
                          {r.user_id}
                        </span>
                      </div>
                    </td>

                    {/* College */}
                    <td className="py-1 px-2 text-[12px] text-muted truncate">
                      <span>{r.college}</span>
                    </td>

                    {/* Personas: Bordered badges, not filled pills */}
                    <td className="py-1 px-2 truncate">
                      <div className="flex items-center gap-1 truncate">
                        {r.personas?.slice(0, 2).map((p) => (
                          <Badge
                            key={p}
                            tone={PERSONA_TONE[p] || 'neutral'}
                            className="text-[9.5px] px-1 py-px tracking-[0.03em] truncate max-w-[105px]"
                          >
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </td>

                    {/* Top Skills: up to 2-3 tags */}
                    <td className="py-1 px-2 truncate">
                      <div className="flex items-center gap-1 truncate">
                        {r.top_skills?.slice(0, 2).map((s) => (
                          <span
                            key={s}
                            className="crm-num rounded-sm border border-border px-1 py-px text-[10px] text-muted shrink-0"
                          >
                            {s}
                          </span>
                        ))}
                        {r.top_skills?.length > 2 && (
                          <span className="crm-num text-[9.5px] text-faint">
                            +{r.top_skills.length - 2}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Events attended: mono, right-aligned */}
                    <td className="crm-num py-1 px-1.5 text-right text-[12px] text-text">
                      {r.hackathons_attended ?? 0}
                    </td>

                    {/* Wins: mono, right-aligned, faint 0 if none */}
                    <td className="crm-num py-1 px-1.5 text-right text-[12px]">
                      {r.prize_count > 0 ? (
                        <span className="text-text font-medium">{r.prize_count}</span>
                      ) : (
                        <span className="text-faint">0</span>
                      )}
                    </td>

                    {/* Engagement score */}
                    <td className="py-1 px-2 text-right">
                      <EngagementCell value={r.engagement} />
                    </td>

                    {/* Last active: mono date */}
                    <td className="crm-num py-1 px-1.5 text-[11px] text-muted truncate">
                      {r.last_active || '—'}
                    </td>

                    {/* Status badge */}
                    <td className="py-1 pl-1.5 pr-3 text-right">
                      <Badge
                        tone={STATUS_TONE[r.status] || 'neutral'}
                        className="text-[9.5px] px-1 py-px"
                      >
                        {r.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Bar */}
      {total > limit && (
        <div className="flex items-center justify-between border-t border-border pt-2.5">
          <div className="crm-num text-[11.5px] text-muted">
            Showing {startRecord}–{endRecord} of {total} candidates
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="text-[11.5px] h-7 px-2"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={endRecord >= total}
              onClick={() => setPage((p) => p + 1)}
              className="text-[11.5px] h-7 px-2"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Profile Drawer: opens when selectedUserId is truthy */}
      <ProfileDrawer userId={selectedUserId} onClose={() => selectUser(null)} />
    </div>
  );
}

export default DatabaseView;
