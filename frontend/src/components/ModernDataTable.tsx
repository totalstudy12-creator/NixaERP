import { useState, useMemo } from 'react';
import DataTable from 'react-data-table-component';
import { FiSearch, FiDownload, FiEdit2, FiTrash2 } from 'react-icons/fi';

interface DataTableProps {
  title: string;
  columns: any[];
  data: any[];
  loading: boolean;
  onEdit?: (row: any) => void;
  onDelete?: (row: any) => void;
  onExport?: () => void;
  rowActions?: (row: any) => React.ReactNode;
  striped?: boolean;
  highlightOnHover?: boolean;
  pointerOnHover?: boolean;
  selectable?: boolean;
  selectedIds?: number[];
  onSelectionChange?: (selectedIds: number[]) => void;
}

export function ModernDataTable({
  title,
  columns,
  data,
  loading,
  onEdit,
  onDelete,
  onExport,
  rowActions,
  striped = true,
  highlightOnHover = true,
  pointerOnHover = true,
  selectable = false,
  selectedIds = [],
  onSelectionChange,
}: DataTableProps) {
  const [searchText, setSearchText] = useState('');

  const filteredData = useMemo(() => {
    return data.filter(item =>
      Object.values(item).some(val =>
        String(val).toLowerCase().includes(searchText.toLowerCase())
      )
    );
  }, [data, searchText]);

  const actionColumn = {
    name: 'Actions',
    cell: (row: any) => (
      <div className="flex gap-2 flex-wrap items-center">
        {rowActions && rowActions(row)}
        {onEdit && (
          <button
            onClick={() => onEdit(row)}
            className="btn btn-sm btn-ghost btn-circle"
            title="Edit"
          >
            <FiEdit2 size={16} className="text-blue-600" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={() => onDelete(row)}
            className="btn btn-sm btn-ghost btn-circle"
            title="Delete"
          >
            <FiTrash2 size={16} className="text-red-600" />
          </button>
        )}
      </div>
    ),
    width: '150px',
  };

  const customStyles = {
    header: {
      style: {
        backgroundColor: '#1e40af',
        color: 'white',
        fontSize: '14px',
        fontWeight: 'bold',
      },
    },
    rows: {
      style: {
        minHeight: '45px',
        fontSize: '14px',
      },
      highlightOnHoverStyle: {
        backgroundColor: '#e0f2fe',
        color: '#000',
      },
    },
    pagination: {
      style: {
        backgroundColor: '#f3f4f6',
        color: '#111827',
      },
    },
  };

  const finalColumns = [...columns];
  if (onEdit || onDelete) {
    finalColumns.push(actionColumn);
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 card">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
          {onExport && (
            <button
              onClick={onExport}
              className="btn btn-primary gap-2"
            >
              <FiDownload /> Export
            </button>
          )}
        </div>
        
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="input-field pl-10 w-full"
          />
        </div>
      </div>

      <DataTable
        columns={finalColumns}
        data={filteredData}
        progressPending={loading}
        striped={striped}
        highlightOnHover={highlightOnHover}
        pointerOnHover={pointerOnHover}
        selectableRows={selectable}
        onSelectedRowsChange={selectable ? ({ selectedRows }: { selectedRows: any[] }) => {
          onSelectionChange?.(selectedRows.map((row: any) => row.id));
        } : undefined}
        selectedRows={selectedIds.map((id) => filteredData.find((row: any) => row.id === id)).filter(Boolean)}
        customStyles={customStyles}
        pagination
        paginationPerPage={10}
        paginationRowsPerPageOptions={[5, 10, 15, 20]}
        noDataComponent={<div className="py-8 text-center text-gray-500">No data found</div>}
      />
    </div>
  );
}
