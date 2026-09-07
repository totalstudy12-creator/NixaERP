import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FiAlertCircle,
  FiArrowLeft,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiCreditCard,
  FiEdit2,
  FiFileText,
  FiHash,
  FiMail,
  FiPhone,
  FiPlus,
  FiPrinter,
  FiShare2,
  FiTrendingUp,
  FiUser,
} from 'react-icons/fi';
import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom';

import { apiClient } from '../api';
import { useNotification } from '../components/NotificationContext';
import InvoicePrintA4 from '../components/invoice-print/InvoicePrintA4';
import { addAppLog } from '../services/appLogger';

import type {
  Invoice,
  InvoiceItem,
  Payment,
} from '../types';

/* ============================================================================
 * TYPES
 * ========================================================================== */

type ThermalFormat = '58mm' | '80mm';

interface PrinterSettings {
  printer_default_format: string;
  printer_connection_mode: string;
}

interface SerialPortLike {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;

  open(options: {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    flowControl?: 'none' | 'hardware';
  }): Promise<void>;

  close(): Promise<void>;
}

interface SerialApiLike {
  requestPort(): Promise<SerialPortLike>;
}

interface ReceiptBusinessInfo {
  companyName: string;
  branchName: string;
  companyAddress: string;
  branchAddress: string;
  companyPhone: string;
  branchPhone: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
}

/* ============================================================================
 * CONSTANTS
 * ========================================================================== */

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const SERIAL_OPTIONS = {
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: 'none' as const,
  flowControl: 'none' as const,
};

const THERMAL_PRINT_WIDTH_PX: Record<
  ThermalFormat,
  number
> = {
  '58mm': 384,
  '80mm': 576,
};

const THERMAL_TEXT_WIDTH: Record<
  ThermalFormat,
  number
> = {
  '58mm': 32,
  '80mm': 48,
};

const PAYMENT_METHODS = [
  { value: 'manual', label: 'Manual' },
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  {
    value: 'online',
    label: 'Online Transfer',
  },
  {
    value: 'cheque',
    label: 'Cheque',
  },
  {
    value: 'credit_card',
    label: 'Credit Card',
  },
] as const;

const statusConfig: Record<
  string,
  {
    bg: string;
    text: string;
    dot: string;
    icon: JSX.Element;
  }
> = {
  paid: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    icon: <FiCheckCircle size={16} />,
  },

  pending: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    icon: <FiClock size={16} />,
  },

  overdue: {
    bg: 'bg-rose-50 border-rose-200',
    text: 'text-rose-700',
    dot: 'bg-rose-500',
    icon: <FiAlertCircle size={16} />,
  },

  draft: {
    bg: 'bg-slate-50 border-slate-200',
    text: 'text-slate-700',
    dot: 'bg-slate-400',
    icon: <FiFileText size={16} />,
  },
};

/* ============================================================================
 * GENERIC HELPERS
 * ========================================================================== */

const safeNumber = (
  value: unknown,
): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (typeof value === 'string') {
    const parsed =
      Number.parseFloat(value);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
};

const cleanText = (
  value: unknown,
): string => {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeFormat = (
  value: unknown,
): 'A4' | ThermalFormat => {
  const normalized = String(
    value || 'A4',
  )
    .trim()
    .toLowerCase();

  if (
    normalized === '58' ||
    normalized === '58mm'
  ) {
    return '58mm';
  }

  if (
    normalized === '80' ||
    normalized === '80mm'
  ) {
    return '80mm';
  }

  return 'A4';
};

const formatDateSafe = (
  value: string | Date | null | undefined,
): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString();
};

const formatDateTimeSafe = (
  value: string | Date | null | undefined,
): string => {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString();
};

const clampText = (
  value: unknown,
  maxLength: number,
): string => {
  const text = cleanText(value);

  if (!text) {
    return '';
  }

  return text.slice(
    0,
    Math.max(1, maxLength),
  );
};

/* ============================================================================
 * SERIAL API
 * ========================================================================== */

const getSerialApi =
  (): SerialApiLike | null => {
    if (
      typeof navigator ===
      'undefined'
    ) {
      return null;
    }

    const nav =
      navigator as Navigator & {
        serial?: SerialApiLike;
      };

    return nav.serial ?? null;
  };

/* ============================================================================
 * PAGE
 * ========================================================================== */

export function InvoiceDetailPage() {
  const { id } =
    useParams<{ id: string }>();

  const navigate =
    useNavigate();

  const {
    showSuccess,
    showError,
  } = useNotification();

  /* ------------------------------------------------------------------------
   * STATE
   * ---------------------------------------------------------------------- */

  const [invoice, setInvoice] =
    useState<Invoice | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(
      null,
    );

  const [paymentAmount, setPaymentAmount] =
    useState('');

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState('manual');

  const [
    submittingPayment,
    setSubmittingPayment,
  ] = useState(false);

  const [
    showPrintSelector,
    setShowPrintSelector,
  ] = useState(false);

  const [
    printerSettings,
    setPrinterSettings,
  ] =
    useState<PrinterSettings | null>(
      null,
    );

  const [
    isMobile,
    setIsMobile,
  ] = useState(false);

  const [
    isThermalPrinting,
    setIsThermalPrinting,
  ] = useState(false);

  const [
    serialPort,
    setSerialPort,
  ] =
    useState<SerialPortLike | null>(
      null,
    );

  const [
    serialConnected,
    setSerialConnected,
  ] = useState(false);

  const [
    serialConnecting,
    setSerialConnecting,
  ] = useState(false);

  const serialPortRef =
    useRef<SerialPortLike | null>(
      null,
    );

  const serialOperationRef =
    useRef<Promise<void> | null>(
      null,
    );

  const encoder =
    useMemo(
      () => new TextEncoder(),
      [],
    );

  /* ------------------------------------------------------------------------
   * INVOICE ID
   * ---------------------------------------------------------------------- */

  const numericId =
    Number(id);

  const validInvoiceId =
    typeof id === 'string' &&
    id.trim().length > 0 &&
    Number.isInteger(
      numericId,
    ) &&
    numericId > 0;

  /* =========================================================================
   * DEVICE DETECTION
   * ======================================================================= */

  useEffect(() => {
    const updateDeviceType =
      () => {
        if (
          typeof window ===
          'undefined'
        ) {
          return;
        }

        const ua =
          navigator.userAgent ||
          '';

        const userAgentMobile =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            ua,
          );

        setIsMobile(
          userAgentMobile ||
            window.innerWidth <=
              768,
        );
      };

    updateDeviceType();

    window.addEventListener(
      'resize',
      updateDeviceType,
    );

    return () => {
      window.removeEventListener(
        'resize',
        updateDeviceType,
      );
    };
  }, []);

  /* =========================================================================
   * PRINTER SETTINGS
   * ======================================================================= */

  useEffect(() => {
    let cancelled = false;

    const loadSettings =
      async () => {
        try {
          const response =
            await apiClient.request(
              'GET',
              '/settings?group=printer',
            );

          const rows =
            Array.isArray(response)
              ? response
              : Array.isArray(
                    response?.data,
                  )
                ? response.data
                : Array.isArray(
                      response
                        ?.data
                        ?.data,
                    )
                  ? response
                      .data
                      .data
                  : [];

          const map: Record<
            string,
            string
          > = {};

          rows.forEach(
            (item: any) => {
              if (
                item &&
                typeof item.key ===
                  'string'
              ) {
                map[item.key] =
                  String(
                    item.value ??
                      '',
                  );
              }
            },
          );

          if (!cancelled) {
            setPrinterSettings(
              {
                printer_default_format:
                  map.printer_default_format ||
                  'A4',

                printer_connection_mode:
                  map.printer_connection_mode ||
                  'browser',
              },
            );
          }
        } catch (err) {
          console.error(
            'Printer settings load failed:',
            err,
          );

          if (!cancelled) {
            setPrinterSettings(
              {
                printer_default_format:
                  'A4',

                printer_connection_mode:
                  'browser',
              },
            );
          }
        }
      };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================================================================
   * INVOICE LOADING
   * ======================================================================= */

  const loadInvoice =
    useCallback(
      async () => {
        if (!validInvoiceId) {
          return;
        }

        setLoading(true);
        setError(null);

        try {
          const response =
            await apiClient.getInvoice(
              numericId,
            );

          if (!response) {
            throw new Error(
              'Invoice details were not returned by the server.',
            );
          }

          setInvoice(
            response as Invoice,
          );
        } catch (err: any) {
          console.error(
            'Invoice load failed:',
            err,
          );

          const message =
            err?.message ||
            'Unable to load invoice details.';

          setError(message);

          showError(
            'Invoice load failed',
            message,
          );
        } finally {
          setLoading(false);
        }
      },
      [
        numericId,
        showError,
        validInvoiceId,
      ],
    );

  useEffect(() => {
    if (!validInvoiceId) {
      setLoading(false);
      setError(
        'Invalid invoice ID. Please check the URL.',
      );
      return;
    }

    void loadInvoice();
  }, [
    loadInvoice,
    validInvoiceId,
  ]);

  /* =========================================================================
   * FINANCIAL CALCULATIONS
   * ======================================================================= */

  const totalAmount =
    useMemo(
      () =>
        safeNumber(
          invoice?.total_amount,
        ),
      [invoice],
    );

  const taxAmount =
    useMemo(
      () =>
        safeNumber(
          invoice?.tax_amount,
        ),
      [invoice],
    );

  const discountAmount =
    useMemo(
      () =>
        safeNumber(
          invoice?.discount_amount,
        ),
      [invoice],
    );

  const itemsTotal =
    useMemo(() => {
      if (
        !invoice?.items?.length
      ) {
        return 0;
      }

      return invoice.items.reduce(
        (
          total,
          item,
        ) =>
          total +
          safeNumber(
            item.total,
          ),
        0,
      );
    }, [invoice]);

  const paidAmount =
    useMemo(() => {
      if (
        !invoice?.payments
          ?.length
      ) {
        return 0;
      }

      return invoice.payments.reduce(
        (
          total,
          payment,
        ) =>
          total +
          safeNumber(
            payment.amount,
          ),
        0,
      );
    }, [invoice]);

  const remainingAmount =
    useMemo(
      () =>
        Math.max(
          0,
          totalAmount -
            paidAmount,
        ),
      [
        paidAmount,
        totalAmount,
      ],
    );

  const isFullyPaid =
    remainingAmount <=
    0.01;

  const paymentProgress =
    useMemo(() => {
      if (
        totalAmount <= 0
      ) {
        return 0;
      }

      return Math.min(
        100,
        Math.max(
          0,
          (paidAmount /
            totalAmount) *
            100,
        ),
      );
    }, [
      paidAmount,
      totalAmount,
    ]);

  /* =========================================================================
   * PAYMENT HANDLERS
   * ======================================================================= */

  const createPayment =
    useCallback(
      async () => {
        if (
          !invoice ||
          submittingPayment
        ) {
          return;
        }

        const amount =
          Number.parseFloat(
            paymentAmount,
          );

        if (
          !Number.isFinite(
            amount,
          ) ||
          amount <= 0
        ) {
          showError(
            'Validation',
            'Enter a valid payment amount greater than zero.',
          );
          return;
        }

        if (
          amount >
          remainingAmount +
            0.01
        ) {
          showError(
            'Validation',
            `Payment cannot exceed Rs ${remainingAmount.toFixed(
              2,
            )}.`,
          );
          return;
        }

        setSubmittingPayment(
          true,
        );

        try {
          await apiClient.createPayment(
            {
              company_id:
                (invoice as any)
                  .company_id,

              invoice_id:
                invoice.id!,

              reference_no:
                `PAY-${Date.now()}`,

              amount,

              payment_direction:
                'inward',

              payment_method:
                paymentMethod,

              status:
                'completed',
            },
          );

          if (
            amount >=
            remainingAmount -
              0.01
          ) {
            try {
              await apiClient.updateInvoice(
                invoice.id!,
                {
                  status:
                    'paid',
                },
              );
            } catch (
              statusError
            ) {
              /*
               * Payment itself succeeded.
               * Do not report the whole payment
               * as failed because the optional
               * invoice status update failed.
               */
              console.warn(
                'Invoice status update failed after payment:',
                statusError,
              );
            }
          }

          showSuccess(
            'Payment added',
            `Rs ${amount.toFixed(
              2,
            )} recorded successfully.`,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Add payment',
            status: 'success',
            message:
              `Payment added to invoice ${invoice.invoice_no}`,
          });

          setPaymentAmount('');

          await loadInvoice();
        } catch (err: any) {
          console.error(
            'Payment creation failed:',
            err,
          );

          const message =
            err?.message ||
            'Payment could not be recorded.';

          showError(
            'Payment failed',
            message,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Add payment',
            status: 'error',
            message,
          });
        } finally {
          setSubmittingPayment(
            false,
          );
        }
      },
      [
        invoice,
        loadInvoice,
        paymentAmount,
        paymentMethod,
        remainingAmount,
        showError,
        showSuccess,
        submittingPayment,
      ],
    );

  const markInvoicePaid =
    useCallback(
      async () => {
        if (
          !invoice ||
          submittingPayment
        ) {
          return;
        }

        if (isFullyPaid) {
          showSuccess(
            'Already paid',
            'This invoice is already fully paid.',
          );

          return;
        }

        const confirmed =
          window.confirm(
            `Mark invoice ${invoice.invoice_no} as paid?\n\nRs ${remainingAmount.toFixed(
              2,
            )} will be recorded as the final payment.`,
          );

        if (!confirmed) {
          return;
        }

        if (
          remainingAmount <=
          0
        ) {
          return;
        }

        setSubmittingPayment(
          true,
        );

        try {
          await apiClient.createPayment(
            {
              company_id:
                (invoice as any)
                  .company_id,

              invoice_id:
                invoice.id!,

              reference_no:
                `PAY-FULL-${Date.now()}`,

              amount:
                remainingAmount,

              payment_direction:
                'inward',

              payment_method:
                'manual',

              status:
                'completed',
            },
          );

          await apiClient.updateInvoice(
            invoice.id!,
            {
              status:
                'paid',
            },
          );

          showSuccess(
            'Invoice marked as paid',
            `Rs ${remainingAmount.toFixed(
              2,
            )} final payment recorded.`,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Mark invoice paid',
            status: 'success',
            message:
              `Invoice ${invoice.invoice_no} marked as paid`,
          });

          await loadInvoice();
        } catch (err: any) {
          console.error(
            'Mark invoice paid failed:',
            err,
          );

          const message =
            err?.message ||
            'Failed to mark invoice as paid.';

          showError(
            'Mark paid failed',
            message,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Mark invoice paid',
            status: 'error',
            message,
          });
        } finally {
          setSubmittingPayment(
            false,
          );
        }
      },
      [
        invoice,
        isFullyPaid,
        loadInvoice,
        remainingAmount,
        showError,
        showSuccess,
        submittingPayment,
      ],
    );

  /* =========================================================================
   * RECEIPT BUSINESS INFO
   * ======================================================================= */

  const getReceiptBusinessInfo =
    useCallback(
      (
        inv: Invoice,
      ): ReceiptBusinessInfo => {
        const source =
          inv as any;

        const company =
          source.company ||
          {};

        const branch =
          source.branch ||
          {};

        const customer =
          inv.customer as any;

        const companyName =
          cleanText(
            company.name ||
              source.company_name ||
              source.business_name ||
              'NIXA ERP',
          ) || 'NIXA ERP';

        const branchName =
          cleanText(
            branch.name ||
              source.branch_name ||
              '',
          );

        const companyAddress =
          [
            company.address ||
              company.address_line1 ||
              source.company_address,

            company.address_line2 ||
              source.company_address_line2,

            company.city ||
              source.company_city,

            company.state ||
              source.company_state,

            company.pincode ||
              source.company_pincode,
          ]
            .map(cleanText)
            .filter(Boolean)
            .join(', ');

        const branchAddress =
          [
            branch.address ||
              branch.address_line1,

            branch.address_line2,

            branch.city,

            branch.state,

            branch.pincode,
          ]
            .map(cleanText)
            .filter(Boolean)
            .join(', ');

        const companyPhone =
          cleanText(
            company.phone ||
              company.mobile ||
              company.phone_number ||
              source.company_phone ||
              '',
          );

        const branchPhone =
          cleanText(
            branch.phone ||
              branch.mobile ||
              branch.phone_number ||
              '',
          );

        const customerName =
          cleanText(
            customer?.name,
          ) || 'Walk-in';

        const customerPhone =
          cleanText(
            customer?.phone ||
              customer?.contact_no ||
              customer?.phone_number ||
              '',
          );

        const customerAddress =
          [
            inv.billing_street ||
              customer?.billing_street ||
              customer?.address ||
              customer?.address_line1,

            inv.billing_city ||
              customer?.billing_city ||
              customer?.city,

            inv.billing_state ||
              customer?.billing_state ||
              customer?.state,

            inv.billing_pincode ||
              customer?.billing_pincode ||
              customer?.pincode,
          ]
            .map(cleanText)
            .filter(Boolean)
            .join(', ');

        return {
          companyName,
          branchName,
          companyAddress,
          branchAddress,
          companyPhone,
          branchPhone,
          customerName,
          customerPhone,
          customerAddress,
        };
      },
      [],
    );

  /* =========================================================================
   * RECEIPT TEXT HELPERS
   * ======================================================================= */

  const padColumns =
    useCallback(
      (
        left: string,
        right: string,
        width: number,
      ) => {
        const leftText =
          cleanText(left);

        const rightText =
          cleanText(right);

        const spaces =
          width -
          leftText.length -
          rightText.length;

        if (spaces > 0) {
          return (
            leftText +
            ' '.repeat(
              spaces,
            ) +
            rightText
          );
        }

        return `${leftText} ${rightText}`;
      },
      [],
    );

  const wrapPreviewAddress =
    useCallback(
      (
        address: string,
        width: number,
      ): string[] => {
        const cleaned =
          cleanText(address);

        if (!cleaned) {
          return [];
        }

        const result: string[] =
          [];

        let current = '';

        for (
          const word of cleaned.split(
            /\s+/,
          )
        ) {
          const candidate =
            current
              ? `${current} ${word}`
              : word;

          if (
            candidate.length <=
            width
          ) {
            current = candidate;
          } else {
            if (current) {
              result.push(
                current,
              );
            }

            current = word;
          }
        }

        if (current) {
          result.push(
            current,
          );
        }

        return result;
      },
      [],
    );

  /* =========================================================================
   * RECEIPT PREVIEW
   * ======================================================================= */

  const generateTextReceipt =
    useCallback(
      (
        format: ThermalFormat,
        inv: Invoice,
      ): string => {
        const width =
          THERMAL_TEXT_WIDTH[
            format
          ];

        const divider =
          '-'.repeat(width);

        const {
          companyName,
          branchName,
          companyAddress,
          branchAddress,
          companyPhone,
          branchPhone,
          customerName,
          customerPhone,
          customerAddress,
        } =
          getReceiptBusinessInfo(
            inv,
          );

        const lines: string[] =
          [];

        /*
         * BUSINESS
         */
        lines.push(
          clampText(
            companyName,
            width,
          ),
        );

        if (branchName) {
          lines.push(
            clampText(
              `Branch: ${branchName}`,
              width,
            ),
          );
        }

        const businessAddress =
          branchAddress ||
          companyAddress;

        if (
          businessAddress
        ) {
          lines.push(
            ...wrapPreviewAddress(
              businessAddress,
              width,
            ),
          );
        }

        const businessPhone =
          branchPhone ||
          companyPhone;

        if (businessPhone) {
          lines.push(
            clampText(
              `Phone: ${businessPhone}`,
              width,
            ),
          );
        }

        lines.push(divider);
        lines.push(''); // blank line for spacing

        /*
         * INVOICE
         */
        lines.push(
          clampText(
            `Invoice: ${inv.invoice_no}`,
            width,
          ),
        );

        lines.push(
          clampText(
            `Bill Date: ${formatDateSafe(
              inv.created_at,
            )}`,
            width,
          ),
        );

        if (inv.due_date) {
          lines.push(
            clampText(
              `Due: ${formatDateSafe(
                inv.due_date,
              )}`,
              width,
            ),
          );
        }

        lines.push(divider);
        lines.push(''); // blank line for spacing

        /*
         * CUSTOMER
         */
        lines.push(
          'CUSTOMER',
        );

        lines.push(
          clampText(
            `Name: ${customerName}`,
            width,
          ),
        );

        if (customerPhone) {
          lines.push(
            clampText(
              `Phone: ${customerPhone}`,
              width,
            ),
          );
        }

        if (
          customerAddress
        ) {
          const customerLines =
            wrapPreviewAddress(
              customerAddress,
              width -
                6,
            );

          customerLines.forEach(
            (line) =>
              lines.push(
                clampText(
                  `Addr: ${line}`,
                  width,
                ),
              ),
          );
        }

        lines.push(divider);
        lines.push(''); // blank line for spacing

        /*
         * ITEMS
         */
        lines.push('ITEM');
        lines.push(divider);

        for (
          const item of inv.items ||
          []
        ) {
          const name =
            cleanText(
              item.product?.name ||
                `Product #${item.product_id}`,
            ) || 'Item';

          // Wrap long item names to multiple lines
          const nameLines =
            wrapPreviewAddress(
              name,
              width,
            );

          nameLines.forEach(
            (line) =>
              lines.push(line),
          );

          lines.push(
            padColumns(
              `Qty: ${safeNumber(
                item.quantity,
              )}`,
              `Rs ${safeNumber(
                item.total,
              ).toFixed(2)}`,
              width,
            ),
          );

          lines.push(
            `Rate: Rs ${safeNumber(
              item.unit_price,
            ).toFixed(2)}`,
          );

          // Add blank line after each item
          lines.push('');
        }

        // Remove the last extra blank line if items exist
        if (
          inv.items?.length &&
          lines[lines.length - 1] === ''
        ) {
          lines.pop();
        }

        lines.push(divider);
        lines.push(''); // blank line for spacing

        /*
         * TOTALS
         */
        lines.push(
          padColumns(
            'SUBTOTAL',
            `Rs ${itemsTotal.toFixed(
              2,
            )}`,
            width,
          ),
        );

        if (
          discountAmount > 0
        ) {
          lines.push(
            padColumns(
              'DISCOUNT',
              `-Rs ${discountAmount.toFixed(
                2,
              )}`,
              width,
            ),
          );
        }

        if (taxAmount > 0) {
          lines.push(
            padColumns(
              'GST/TAX',
              `Rs ${taxAmount.toFixed(
                2,
              )}`,
              width,
            ),
          );
        }

        lines.push(divider);

        lines.push(
          padColumns(
            'GRAND TOTAL',
            `Rs ${totalAmount.toFixed(
              2,
            )}`,
            width,
          ),
        );

        lines.push(
          padColumns(
            'PAID',
            `Rs ${paidAmount.toFixed(
              2,
            )}`,
            width,
          ),
        );

        lines.push(
          padColumns(
            'BALANCE',
            `Rs ${remainingAmount.toFixed(
              2,
            )}`,
            width,
          ),
        );

        lines.push(divider);
        lines.push(''); // blank line for spacing

        /*
         * PAYMENTS
         */
        if (
          inv.payments &&
          inv.payments.length > 0
        ) {
          lines.push(
            'PAYMENTS',
          );

          lines.push(divider);

          for (
            const payment of inv.payments
          ) {
            lines.push(
              padColumns(
                cleanText(
                  payment.payment_method ||
                    'manual',
                ).toUpperCase(),
                `Rs ${safeNumber(
                  payment.amount,
                ).toFixed(2)}`,
                width,
              ),
            );

            if (
              payment.reference_no
            ) {
              lines.push(
                clampText(
                  `Ref: ${payment.reference_no}`,
                  width,
                ),
              );
            }

            lines.push(
              clampText(
                `Date: ${formatDateSafe(
                  payment.created_at,
                )}`,
                width,
              ),
            );

            // Add blank line between payments
            lines.push('');
          }

          // Remove last blank line
          if (
            lines[lines.length - 1] ===
            ''
          ) {
            lines.pop();
          }

          lines.push(divider);
          lines.push(''); // blank line for spacing
        }

        /*
         * NOTES
         */
        if (
          inv.notes &&
          cleanText(inv.notes)
        ) {
          lines.push('NOTES');
          lines.push(divider);

          const noteLines =
            wrapPreviewAddress(
              inv.notes,
              width,
            );

          noteLines.forEach(
            (line) =>
              lines.push(line),
          );

          lines.push(divider);
          lines.push('');
        }

        lines.push(
          'THANK YOU!',
        );

        return (
          lines.join('\n') +
          '\n'
        );
      },
      [
        discountAmount,
        getReceiptBusinessInfo,
        itemsTotal,
        paidAmount,
        padColumns,
        remainingAmount,
        taxAmount,
        totalAmount,
        wrapPreviewAddress,
      ],
    );

  /* =========================================================================
   * WHATSAPP RECEIPT GENERATOR
   * ======================================================================= */

  const generateWhatsAppReceipt =
    useCallback(
      (inv: Invoice): string => {
        const width = 32; // 58mm width for WhatsApp text
        const divider = '-'.repeat(width);
        const equalsDivider =
          '='.repeat(width);

        const info = getReceiptBusinessInfo(inv);

        // Prefer branch details, fall back to company details
        const businessAddress =
          info.branchAddress || info.companyAddress;
        const businessPhone =
          info.branchPhone || info.companyPhone;

        const lines: string[] = [];

        // Header
        lines.push(info.companyName);
        if (info.branchName) {
          lines.push(`Branch: ${info.branchName}`);
        }
        if (businessAddress) {
          lines.push(businessAddress);
        }
        if (businessPhone) {
          lines.push(`Phone: ${businessPhone}`);
        }

        lines.push(divider);

        // Invoice details
        lines.push(`Invoice: ${inv.invoice_no}`);
        lines.push(`Date: ${formatDateSafe(inv.created_at)}`);

        lines.push(divider);

        // Customer
        lines.push('CUSTOMER');
        lines.push(`Name: ${info.customerName}`);
        if (info.customerPhone) {
          lines.push(`Phone: ${info.customerPhone}`);
        }
        if (info.customerAddress) {
          const addrLines = wrapPreviewAddress(
            info.customerAddress,
            width - 6,
          );
          addrLines.forEach((line) =>
            lines.push(`Addr: ${line}`),
          );
        }

        lines.push(divider);

        // Items
        lines.push('ITEM');
        lines.push(divider);

        for (const item of inv.items || []) {
          const name =
            cleanText(
              item.product?.name ||
                `Product #${item.product_id}`,
            ) || 'Item';

          const nameLines = wrapPreviewAddress(
            name,
            width,
          );
          nameLines.forEach((line) => lines.push(line));

          lines.push(
            padColumns(
              `Qty: ${safeNumber(item.quantity)}`,
              `₹${safeNumber(item.total).toFixed(2)}`,
              width,
            ),
          );
          lines.push(
            `Rate: ₹${safeNumber(item.unit_price).toFixed(2)}`,
          );
          lines.push(''); // blank line after each item
        }

        // Remove last blank if any
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }

        lines.push(divider);

        // Totals
        lines.push(
          padColumns(
            'SUBTOTAL',
            `₹${itemsTotal.toFixed(2)}`,
            width,
          ),
        );
        if (discountAmount > 0) {
          lines.push(
            padColumns(
              'DISCOUNT',
              `-₹${discountAmount.toFixed(2)}`,
              width,
            ),
          );
        }
        if (taxAmount > 0) {
          lines.push(
            padColumns(
              'GST',
              `₹${taxAmount.toFixed(2)}`,
              width,
            ),
          );
        }

        lines.push(divider);

        lines.push(
          padColumns(
            'GRAND TOTAL',
            `₹${totalAmount.toFixed(2)}`,
            width,
          ),
        );
        lines.push(
          padColumns(
            'PAID',
            `₹${paidAmount.toFixed(2)}`,
            width,
          ),
        );
        lines.push(
          padColumns(
            'BALANCE',
            `₹${remainingAmount.toFixed(2)}`,
            width,
          ),
        );

        lines.push(equalsDivider);

        lines.push('THANK YOU!');
        lines.push('VISIT AGAIN');

        return lines.join('\n');
      },
      [
        getReceiptBusinessInfo,
        padColumns,
        wrapPreviewAddress,
        itemsTotal,
        discountAmount,
        taxAmount,
        totalAmount,
        paidAmount,
        remainingAmount,
      ],
    );

  /* =========================================================================
   * PHONE NUMBER NORMALIZATION
   * ======================================================================= */

  const normalizePhoneNumber = useCallback(
    (phone: string): string => {
      let digits = phone.replace(/\D/g, '');
      if (digits.length === 10) {
        digits = `91${digits}`;
      }
      return digits;
    },
    [],
  );

  /* =========================================================================
   * WHATSAPP SHARE HANDLER
   * ======================================================================= */

  const handleWhatsAppShare =
    useCallback(() => {
      if (!invoice) return;

      const customerPhone =
        invoice.customer?.phone ||
        invoice.customer?.contact_no ||
        invoice.customer?.phone_number;

      if (!customerPhone) {
        showError(
          'WhatsApp share failed',
          'Customer phone number is not available.',
        );
        return;
      }

      const message =
        generateWhatsAppReceipt(invoice);

      const phone =
        normalizePhoneNumber(customerPhone);

      const url = `https://wa.me/${phone}?text=${encodeURIComponent(
        message,
      )}`;

      window.open(url, '_blank');

      showSuccess(
        'WhatsApp share',
        'Receipt text opened in WhatsApp.',
      );

      addAppLog({
        module: 'Invoices',
        action: 'WhatsApp share',
        status: 'success',
        message: `WhatsApp receipt shared for invoice ${invoice.invoice_no}`,
      });
    }, [
      invoice,
      generateWhatsAppReceipt,
      normalizePhoneNumber,
      showError,
      showSuccess,
    ]);

  /* =========================================================================
   * ESC/POS TEXT ENCODING
   * ======================================================================= */

  const encodePrinterText =
    useCallback(
      (
        value: string,
      ): number[] => {
        const normalized =
          value
            .normalize('NFKD')
            .replace(
              /[\u0300-\u036f]/g,
              '',
            )
            .replace(
              /[^\x20-\x7E]/g,
              '?',
            );

        return Array.from(
          encoder.encode(
            normalized,
          ),
        );
      },
      [encoder],
    );

  const appendBytes =
    useCallback(
      (
        target: number[],
        source: number[],
      ) => {
        target.push(...source);
      },
      [],
    );

  /* =========================================================================
   * RASTER TEXT
   * ======================================================================= */

  const renderTextRaster =
    useCallback(
      (
        text: string,
        format: ThermalFormat,
        options?: {
          bold?: boolean;
          top?: number;
          bottom?: number;
          fixedFontSize?: number;
        },
      ): number[] => {
        if (
          typeof document ===
          'undefined'
        ) {
          return [
            ...encodePrinterText(
              text,
            ),
            LF,
          ];
        }

        const value =
          cleanText(text);

        if (!value) {
          return [LF];
        }

        const targetWidth =
          THERMAL_PRINT_WIDTH_PX[
            format
          ];

        const bold =
          options?.bold ?? false;

        // Reduced padding to save paper
        const top =
          options?.top ?? 0;

        const bottom =
          options?.bottom ?? 0;

        const measureCanvas =
          document.createElement(
            'canvas',
          );

        const measureContext =
          measureCanvas.getContext(
            '2d',
          );

        if (
          !measureContext
        ) {
          return [
            ...encodePrinterText(
              value,
            ),
            LF,
          ];
        }

        let fontSize: number;
        if (options?.fixedFontSize) {
          fontSize =
            options.fixedFontSize;
        } else {
          fontSize =
            format === '58mm'
              ? 26
              : 29;

          const fontFamily =
            'Arial, "Segoe UI", sans-serif';

          let measuredWidth = 0;

          while (
            fontSize > 10
          ) {
            measureContext.font =
              `${bold ? '700' : '400'} ${fontSize}px ${fontFamily}`;

            measuredWidth =
              Math.ceil(
                measureContext.measureText(
                  value,
                ).width,
              );

            if (
              measuredWidth <=
              targetWidth - 8
            ) {
              break;
            }

            fontSize -= 1;
          }
        }

        const fontFamily =
          'Arial, "Segoe UI", sans-serif';

        measureContext.font =
          `${bold ? '700' : '400'} ${fontSize}px ${fontFamily}`;

        const measuredWidth =
          Math.ceil(
            measureContext.measureText(
              value,
            ).width,
          );

        const sourceWidth =
          Math.max(
            measuredWidth + 8,
            8,
          );

        // Reduced extra height from +8 to +2
        const sourceHeight =
          Math.max(
            fontSize +
              top +
              bottom +
              2,
            16,
          );

        const sourceCanvas =
          document.createElement(
            'canvas',
          );

        sourceCanvas.width =
          sourceWidth;

        sourceCanvas.height =
          sourceHeight;

        const sourceContext =
          sourceCanvas.getContext(
            '2d',
          );

        if (
          !sourceContext
        ) {
          return [
            ...encodePrinterText(
              value,
            ),
            LF,
          ];
        }

        sourceContext.fillStyle =
          '#ffffff';

        sourceContext.fillRect(
          0,
          0,
          sourceWidth,
          sourceHeight,
        );

        sourceContext.fillStyle =
          '#000000';

        sourceContext.font =
          `${bold ? '700' : '400'} ${fontSize}px ${fontFamily}`;

        sourceContext.textBaseline =
          'top';

        sourceContext.imageSmoothingEnabled =
          true;

        sourceContext.fillText(
          value,
          4,
          top,
        );

        const destinationWidth =
          Math.max(
            8,
            Math.min(
              targetWidth,
              sourceWidth,
            ),
          );

        const destinationHeight =
          sourceHeight;

        const outputWidthBytes =
          Math.ceil(
            destinationWidth / 8,
          );

        const outputWidth =
          outputWidthBytes * 8;

        const outputCanvas =
          document.createElement(
            'canvas',
          );

        outputCanvas.width =
          outputWidth;

        outputCanvas.height =
          destinationHeight;

        const outputContext =
          outputCanvas.getContext(
            '2d',
          );

        if (
          !outputContext
        ) {
          return [
            ...encodePrinterText(
              value,
            ),
            LF,
          ];
        }

        outputContext.fillStyle =
          '#ffffff';

        outputContext.fillRect(
          0,
          0,
          outputWidth,
          destinationHeight,
        );

        outputContext.imageSmoothingEnabled =
          true;

        outputContext.drawImage(
          sourceCanvas,
          0,
          0,
          sourceWidth,
          sourceHeight,
          0,
          0,
          destinationWidth,
          destinationHeight,
        );

        const image =
          outputContext.getImageData(
            0,
            0,
            outputWidth,
            destinationHeight,
          );

        const bitmapLength =
          outputWidthBytes *
          destinationHeight;

        const bitmap =
          new Array<number>(
            bitmapLength,
          ).fill(0);

        for (
          let y = 0;
          y <
          destinationHeight;
          y += 1
        ) {
          for (
            let byteX = 0;
            byteX <
            outputWidthBytes;
            byteX += 1
          ) {
            let byte = 0;

            for (
              let bit = 0;
              bit < 8;
              bit += 1
            ) {
              const x =
                byteX * 8 + bit;

              const pixelIndex =
                (y *
                  outputWidth +
                  x) *
                4;

              const red =
                image.data[
                  pixelIndex
                ];

              const green =
                image.data[
                  pixelIndex + 1
                ];

              const blue =
                image.data[
                  pixelIndex + 2
                ];

              const alpha =
                image.data[
                  pixelIndex + 3
                ];

              if (
                alpha > 20 &&
                red +
                  green +
                  blue <
                  620
              ) {
                byte |=
                  0x80 >> bit;
              }
            }

            bitmap[
              y *
                outputWidthBytes +
                byteX
            ] = byte;
          }
        }

        const xL =
          outputWidthBytes &
          0xff;

        const xH =
          (outputWidthBytes >>
            8) &
          0xff;

        const yL =
          destinationHeight &
          0xff;

        const yH =
          (destinationHeight >>
            8) &
          0xff;

        return [
          GS,
          0x76,
          0x30,
          0x00,
          xL,
          xH,
          yL,
          yH,
          ...bitmap,
          LF,
        ];
      },
      [encodePrinterText],
    );

  /* =========================================================================
   * FIXED FONT WRAPPING
   * ======================================================================= */

  const wrapTextAtFixedFont =
    useCallback(
      (
        text: string,
        format: ThermalFormat,
        fontSize: number,
      ): string[] => {
        if (
          typeof document ===
          'undefined'
        ) {
          // Fallback: approximate by character count
          const maxChars =
            format === '58mm'
              ? 32
              : 48;

          const words =
            cleanText(text).split(
              /\s+/,
            );

          const lines: string[] =
            [];

          let currentLine = '';

          for (
            let word of words
          ) {
            if (
              (
                currentLine +
                ' ' +
                word
              ).trim().length <=
              maxChars
            ) {
              currentLine = (
                currentLine +
                ' ' +
                word
              ).trim();
            } else {
              if (
                currentLine
              ) {
                lines.push(
                  currentLine,
                );
              }

              while (
                word.length >
                maxChars
              ) {
                lines.push(
                  word.substring(
                    0,
                    maxChars,
                  ),
                );

                word =
                  word.substring(
                    maxChars,
                  );
              }

              currentLine = word;
            }
          }

          if (currentLine) {
            lines.push(
              currentLine,
            );
          }

          return lines.length
            ? lines
            : [''];
        }

        const measureCanvas =
          document.createElement(
            'canvas',
          );

        const measureContext =
          measureCanvas.getContext(
            '2d',
          );

        if (
          !measureContext
        ) {
          return [
            cleanText(text),
          ];
        }

        const fontFamily =
          'Arial, "Segoe UI", sans-serif';

        measureContext.font =
          `${fontSize}px ${fontFamily}`;

        const maxWidth =
          THERMAL_PRINT_WIDTH_PX[
            format
          ] - 8; // margin

        const words =
          cleanText(text).split(
            /\s+/,
          );

        const lines: string[] =
          [];

        let currentLine = '';

        for (
          let word of words
        ) {
          // If a single word is too wide, break it character by character
          while (
            measureContext.measureText(
              word,
            ).width > maxWidth &&
            word.length > 1
          ) {
            // Binary search to find how many characters fit
            let low = 0;
            let high = word.length;

            while (low < high) {
              const mid = Math.ceil(
                (low + high) / 2,
              );

              const test = word.substring(
                0,
                mid,
              );

              if (
                measureContext.measureText(
                  test,
                ).width <= maxWidth
              ) {
                low = mid;
              } else {
                high = mid - 1;
              }
            }

            const fitPart =
              word.substring(
                0,
                low || 1,
              );

            word =
              word.substring(
                low || 1,
              );

            if (currentLine) {
              lines.push(
                currentLine,
              );

              currentLine = '';
            }

            lines.push(
              fitPart,
            );
          }

          const candidate = currentLine
            ? `${currentLine} ${word}`
            : word;

          if (
            measureContext.measureText(
              candidate,
            ).width <= maxWidth
          ) {
            currentLine = candidate;
          } else {
            if (currentLine) {
              lines.push(
                currentLine,
              );
            }

            currentLine = word;
          }
        }

        if (currentLine) {
          lines.push(
            currentLine,
          );
        }

        return lines.length
          ? lines
          : [''];
      },
      [],
    );

  /* =========================================================================
   * RECEIPT RASTER ADDRESS
   * ======================================================================= */

  const appendRasterWrappedText =
    useCallback(
      (
        output: number[],
        text: string,
        format: ThermalFormat,
        maxChars: number,
        prefix = '',
      ) => {
        const cleaned =
          cleanText(text);

        if (!cleaned) {
          return;
        }

        const words =
          cleaned.split(/\s+/);

        let current = '';

        for (
          const word of words
        ) {
          const candidate =
            current
              ? `${current} ${word}`
              : word;

          if (
            candidate.length <=
            maxChars
          ) {
            current = candidate;
          } else {
            if (current) {
              appendBytes(
                output,
                renderTextRaster(
                  `${prefix}${current}`,
                  format,
                  {
                    top: 0,
                    bottom: 0,
                  },
                ),
              );
            }

            current = word;
          }
        }

        if (current) {
          appendBytes(
            output,
            renderTextRaster(
              `${prefix}${current}`,
              format,
              {
                top: 0,
                bottom: 0,
              },
            ),
          );
        }
      },
      [
        appendBytes,
        renderTextRaster,
      ],
    );

  /* =========================================================================
   * ESC/POS PAYLOAD
   * ======================================================================= */

  const buildEscPosPayload =
    useCallback(
      (
        format: ThermalFormat,
        inv: Invoice,
      ): Uint8Array => {
        const output: number[] =
          [];

        const width =
          THERMAL_TEXT_WIDTH[
            format
          ];

        const divider =
          '-'.repeat(width);

        const {
          companyName,
          branchName,
          companyAddress,
          branchAddress,
          companyPhone,
          branchPhone,
          customerName,
          customerPhone,
          customerAddress,
        } =
          getReceiptBusinessInfo(
            inv,
          );

        const text =
          (
            value: string,
          ) => {
            appendBytes(
              output,
              encodePrinterText(
                value,
              ),
            );
            output.push(LF);
          };

        const raw =
          (
            bytes: number[],
          ) => {
            output.push(
              ...bytes,
            );
          };

        /*
         * RESET
         */
        raw([
          ESC,
          0x40,
        ]);

        /*
         * Set line spacing to 16 dots (saves paper)
         */
        raw([
          ESC,
          0x33,
          0x10,
        ]);

        /*
         * Character spacing = 0.
         */
        raw([
          ESC,
          0x20,
          0x00,
        ]);

        /*
         * HEADER CENTER
         */
        raw([
          ESC,
          0x61,
          0x01,
        ]);

        raw([
          ESC,
          0x45,
          0x01,
        ]);

        raw(
          renderTextRaster(
            companyName,
            format,
            {
              bold: true,
              top: 1,
              bottom: 1,
            },
          ),
        );

        raw([
          ESC,
          0x45,
          0x00,
        ]);

        if (branchName) {
          raw(
            renderTextRaster(
              `Branch: ${branchName}`,
              format,
              {
                top: 0,
                bottom: 0,
              },
            ),
          );
        }

        /*
         * BUSINESS ADDRESS
         */
        const businessAddress =
          branchAddress ||
          companyAddress;

        appendRasterWrappedText(
          output,
          businessAddress,
          format,
          width,
        );

        /*
         * BUSINESS PHONE
         */
        const businessPhone =
          branchPhone ||
          companyPhone;

        if (businessPhone) {
          raw(
            renderTextRaster(
              `Phone: ${businessPhone}`,
              format,
              {
                top: 0,
                bottom: 0,
              },
            ),
          );
        }

        /*
         * LEFT ALIGN
         */
        raw([
          ESC,
          0x61,
          0x00,
        ]);

        text(divider);
        text(''); // blank line for spacing

        /*
         * INVOICE NUMBER / DATE
         */
        text(
          clampText(
            `Invoice: ${inv.invoice_no}`,
            width,
          ),
        );

        text(
          clampText(
            `Bill Date: ${formatDateSafe(
              inv.created_at,
            )}`,
            width,
          ),
        );

        if (inv.due_date) {
          text(
            clampText(
              `Due: ${formatDateSafe(
                inv.due_date,
              )}`,
              width,
            ),
          );
        }

        text(divider);
        text(''); // blank line for spacing

        /*
         * CUSTOMER SECTION
         */
        raw([
          ESC,
          0x45,
          0x01,
        ]);

        text('CUSTOMER');

        raw([
          ESC,
          0x45,
          0x00,
        ]);

        /*
         * CUSTOMER NAME
         */
        raw(
          renderTextRaster(
            `Name: ${customerName}`,
            format,
            {
              top: 0,
              bottom: 0,
            },
          ),
        );

        if (customerPhone) {
          raw(
            renderTextRaster(
              `Phone: ${customerPhone}`,
              format,
              {
                top: 0,
                bottom: 0,
              },
            ),
          );
        }

        /*
         * CUSTOMER ADDRESS
         */
        appendRasterWrappedText(
          output,
          customerAddress,
          format,
          Math.max(
            10,
            width - 6,
          ),
          'Addr: ',
        );

        text(divider);
        text(''); // blank line for spacing

        /*
         * ITEMS
         */
        raw([
          ESC,
          0x45,
          0x01,
        ]);

        text('ITEM');

        raw([
          ESC,
          0x45,
          0x00,
        ]);

        text(divider);

        // Fixed font size for item names
        const itemFontSize =
          format === '58mm'
            ? 22
            : 24;

        for (
          const item of inv.items ||
          []
        ) {
          const productName =
            cleanText(
              item.product?.name ||
                `Product #${item.product_id}`,
            ) || 'Item';

          // Wrap long names into multiple lines with fixed font
          const nameLines =
            wrapTextAtFixedFont(
              productName,
              format,
              itemFontSize,
            );

          nameLines.forEach(
            (line) => {
              raw(
                renderTextRaster(
                  line,
                  format,
                  {
                    fixedFontSize:
                      itemFontSize,
                    top: 0,
                    bottom: 0,
                  },
                ),
              );
            },
          );

          text(
            padColumns(
              `Qty: ${safeNumber(
                item.quantity,
              )}`,
              `Rs ${safeNumber(
                item.total,
              ).toFixed(2)}`,
              width,
            ),
          );

          text(
            `Rate: Rs ${safeNumber(
              item.unit_price,
            ).toFixed(2)}`,
          );

          // Blank line after each item
          text('');
        }

        text(divider);
        text(''); // blank line for spacing

        /*
         * TOTALS
         */
        text(
          padColumns(
            'SUBTOTAL',
            `Rs ${itemsTotal.toFixed(
              2,
            )}`,
            width,
          ),
        );

        if (
          discountAmount > 0
        ) {
          text(
            padColumns(
              'DISCOUNT',
              `-Rs ${discountAmount.toFixed(
                2,
              )}`,
              width,
            ),
          );
        }

        if (taxAmount > 0) {
          text(
            padColumns(
              'GST/TAX',
              `Rs ${taxAmount.toFixed(
                2,
              )}`,
              width,
            ),
          );
        }

        text(divider);

        /*
         * GRAND TOTAL
         */
        raw([
          ESC,
          0x45,
          0x01,
        ]);

        text(
          padColumns(
            'GRAND TOTAL',
            `Rs ${totalAmount.toFixed(
              2,
            )}`,
            width,
          ),
        );

        raw([
          ESC,
          0x45,
          0x00,
        ]);

        text(
          padColumns(
            'PAID',
            `Rs ${paidAmount.toFixed(
              2,
            )}`,
            width,
          ),
        );

        text(
          padColumns(
            'BALANCE',
            `Rs ${remainingAmount.toFixed(
              2,
            )}`,
            width,
          ),
        );

        text(divider);
        text(''); // blank line for spacing

        /*
         * PAYMENTS
         */
        if (
          inv.payments &&
          inv.payments.length > 0
        ) {
          text(
            'PAYMENTS',
          );

          text(divider);

          for (
            const payment of inv.payments
          ) {
            text(
              padColumns(
                cleanText(
                  payment.payment_method ||
                    'manual',
                ).toUpperCase(),
                `Rs ${safeNumber(
                  payment.amount,
                ).toFixed(2)}`,
                width,
              ),
            );

            if (
              payment.reference_no
            ) {
              raw(
                renderTextRaster(
                  `Ref: ${payment.reference_no}`,
                  format,
                  {
                    top: 0,
                    bottom: 0,
                  },
                ),
              );
            }

            raw(
              renderTextRaster(
                `Date: ${formatDateSafe(
                  payment.created_at,
                )}`,
                format,
                {
                  top: 0,
                  bottom: 0,
                },
              ),
            );

            // Blank line between payments
            text('');
          }

          text(divider);
          text(''); // blank line for spacing
        }

        /*
         * NOTES
         */
        if (
          inv.notes &&
          cleanText(inv.notes)
        ) {
          text('NOTES');
          text(divider);

          const noteLines =
            wrapTextAtFixedFont(
              inv.notes,
              format,
              18, // slightly smaller font for notes
            );

          noteLines.forEach(
            (line) => {
              raw(
                renderTextRaster(
                  line,
                  format,
                  {
                    fixedFontSize:
                      18,
                    top: 0,
                    bottom: 0,
                  },
                ),
              );
            },
          );

          text(divider);
          text('');
        }

        /*
         * FOOTER
         */
        raw([
          ESC,
          0x61,
          0x01,
        ]);

        raw([
          ESC,
          0x45,
          0x01,
        ]);

        text(
          'THANK YOU!',
        );

        raw([
          ESC,
          0x45,
          0x00,
        ]);

        raw([
          ESC,
          0x61,
          0x00,
        ]);

        /*
         * Reset line spacing to default before feed/cut
         */
        raw([
          ESC,
          0x32,
        ]);

        /*
         * Feed 3 lines
         */
        raw([
          ESC,
          0x64,
          0x03,
        ]);

        /*
         * Auto-cut.
         */
        raw([
          GS,
          0x56,
          0x00,
        ]);

        return new Uint8Array(
          output,
        );
      },
      [
        appendBytes,
        appendRasterWrappedText,
        discountAmount,
        encodePrinterText,
        getReceiptBusinessInfo,
        itemsTotal,
        padColumns,
        paidAmount,
        remainingAmount,
        renderTextRaster,
        taxAmount,
        totalAmount,
        wrapTextAtFixedFont,
      ],
    );

  /* =========================================================================
   * SERIAL PORT HELPERS
   * ======================================================================= */

  const isPortOpen =
    useCallback(
      (
        port:
          | SerialPortLike
          | null,
      ) =>
        Boolean(
          port?.readable ||
            port?.writable,
        ),
      [],
    );

  const closeSerialPort =
    useCallback(
      async (
        port:
          | SerialPortLike
          | null,
      ) => {
        if (!port) {
          return;
        }

        try {
          if (port.readable) {
            try {
              await port.readable.cancel();
            } catch {
              /*
               * Ignore already-closed streams.
               */
            }
          }
        } catch {
          /*
           * Ignore cleanup errors.
           */
        }

        try {
          await port.close();
        } catch {
          /*
           * Ignore already-closed ports.
           */
        }
      },
      [],
    );

  const openSerialPort =
    useCallback(
      async (
        port: SerialPortLike,
      ): Promise<SerialPortLike> => {
        if (!port) {
          throw new Error(
            'No thermal printer port selected.',
          );
        }

        if (
          port.writable &&
          isPortOpen(port)
        ) {
          return port;
        }

        let firstError: unknown =
          null;

        try {
          await port.open(
            SERIAL_OPTIONS,
          );
        } catch (error) {
          firstError = error;

          try {
            await closeSerialPort(
              port,
            );
          } catch {
            // Ignore cleanup errors.
          }

          try {
            await port.open(
              SERIAL_OPTIONS,
            );
          } catch (secondError) {
            const message =
              secondError instanceof
              Error
                ? secondError.message
                : String(
                    secondError ||
                      firstError ||
                      'Unable to open thermal printer.',
                  );

            const errorObject =
              new Error(message);

            (
              errorObject as any
            ).cause =
              firstError;

            throw errorObject;
          }
        }

        if (!port.writable) {
          await closeSerialPort(
            port,
          );

          throw new Error(
            'The printer port opened, but it does not provide a writable stream.',
          );
        }

        return port;
      },
      [
        closeSerialPort,
        isPortOpen,
      ],
    );

  /* =========================================================================
   * SERIAL OPERATION LOCK
   * ======================================================================= */

  const withSerialLock =
    useCallback(
      async (
        operation: () => Promise<void>,
      ) => {
        while (
          serialOperationRef.current
        ) {
          try {
            await serialOperationRef.current;
          } catch {
            /*
             * Previous operation already handled its own error.
             */
          }
        }

        const operationPromise =
          operation();

        serialOperationRef.current =
          operationPromise;

        try {
          await operationPromise;
        } finally {
          if (
            serialOperationRef.current ===
            operationPromise
          ) {
            serialOperationRef.current =
              null;
          }
        }
      },
      [],
    );

  /* =========================================================================
   * CONNECT PRINTER
   * ======================================================================= */

  const connectPrinter =
    useCallback(
      async (): Promise<
        SerialPortLike | null
      > => {
        if (isMobile) {
          showError(
            'Printer connection',
            'Web Serial is not available on mobile. Use RawBT on Android.',
          );

          return null;
        }

        const serial =
          getSerialApi();

        if (!serial) {
          showError(
            'Web Serial unavailable',
            'Use Chrome or Edge on Windows and open the ERP from localhost or HTTPS.',
          );

          return null;
        }

        if (serialConnecting) {
          return (
            serialPortRef.current
          );
        }

        setSerialConnecting(
          true,
        );

        try {
          const selectedPort =
            await serial.requestPort();

          const previousPort =
            serialPortRef.current;

          if (
            previousPort &&
            previousPort !==
              selectedPort
          ) {
            await closeSerialPort(
              previousPort,
            );
          }

          const openedPort =
            await openSerialPort(
              selectedPort,
            );

          serialPortRef.current =
            openedPort;

          setSerialPort(
            openedPort,
          );

          setSerialConnected(
            Boolean(
              openedPort.writable,
            ),
          );

          showSuccess(
            'Printer connected',
            'Thermal printer is connected and ready.',
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Thermal Printer Connect',
            status: 'success',
            message:
              'Thermal printer connected through Web Serial',
          });

          return openedPort;
        } catch (err: any) {
          console.error(
            'Printer connection failed:',
            err,
          );

          serialPortRef.current =
            null;

          setSerialPort(null);
          setSerialConnected(
            false,
          );

          const raw =
            String(
              err?.message ||
                'Unable to connect to thermal printer.',
            );

          let message = raw;

          if (
            /permission|securityerror|not allowed/i.test(
              raw,
            )
          ) {
            message =
              'Printer permission was denied. Select the correct COM port and allow browser access.';
          } else if (
            /cancel|abort|no port selected/i.test(
              raw,
            )
          ) {
            message =
              'Printer selection was cancelled.';
          } else if (
            /access denied|busy|in use|already open|invalid state|failed to open|open serial port/i.test(
              raw,
            )
          ) {
            message =
              'The selected COM port is busy, already open, or disconnected. Close other printer software, reconnect the printer, then select the COM port again.';
          }

          showError(
            'Printer connection failed',
            message,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Thermal Printer Connect',
            status: 'error',
            message,
          });

          return null;
        } finally {
          setSerialConnecting(
            false,
          );
        }
      },
      [
        closeSerialPort,
        isMobile,
        openSerialPort,
        serialConnecting,
        showError,
        showSuccess,
      ],
    );

  /* =========================================================================
   * GET CURRENT / RECONNECT PRINTER
   * ======================================================================= */

  const getConnectedPrinter =
    useCallback(
      async (): Promise<
        SerialPortLike | null
      > => {
        if (isMobile) {
          return null;
        }

        const current =
          serialPortRef.current ||
          serialPort;

        if (!current) {
          return connectPrinter();
        }

        try {
          if (
            current.writable
          ) {
            setSerialConnected(
              true,
            );

            return current;
          }

          const reopened =
            await openSerialPort(
              current,
            );

          serialPortRef.current =
            reopened;

          setSerialPort(
            reopened,
          );

          setSerialConnected(
            true,
          );

          return reopened;
        } catch (error) {
          console.warn(
            'Existing printer handle is stale:',
            error,
          );

          await closeSerialPort(
            current,
          );

          serialPortRef.current =
            null;

          setSerialPort(null);

          setSerialConnected(
            false,
          );

          return connectPrinter();
        }
      },
      [
        closeSerialPort,
        connectPrinter,
        isMobile,
        openSerialPort,
        serialPort,
      ],
    );

  /* =========================================================================
   * SERIAL CLEANUP
   * ======================================================================= */

  useEffect(() => {
    return () => {
      const port =
        serialPortRef.current;

      serialPortRef.current =
        null;

      if (port) {
        void closeSerialPort(
          port,
        );
      }
    };
  }, [closeSerialPort]);

  /* =========================================================================
   * THERMAL PRINT
   * ======================================================================= */

  const printThermal =
    useCallback(
      async (
        format: ThermalFormat,
      ) => {
        if (
          !invoice ||
          isThermalPrinting
        ) {
          return;
        }

        setIsThermalPrinting(
          true,
        );

        try {
          if (isMobile) {
            const receipt =
              generateTextReceipt(
                format,
                invoice,
              );

            window.location.href =
              `rawbt:text=${encodeURIComponent(
                receipt,
              )}`;

            addAppLog({
              module: 'Invoices',
              action:
                'Thermal Print RawBT',
              status: 'success',
              message:
                `${format} RawBT print request sent`,
            });

            return;
          }

          let retried = false;

          await withSerialLock(
            async () => {
              let port =
                await getConnectedPrinter();

              if (
                !port?.writable
              ) {
                port =
                  await connectPrinter();
              }

              if (
                !port?.writable
              ) {
                throw new Error(
                  'No writable thermal printer is connected.',
                );
              }

              const payload =
                buildEscPosPayload(
                  format,
                  invoice,
                );

              try {
                const writer =
                  port.writable.getWriter();

                try {
                  await writer.write(
                    payload,
                  );
                } finally {
                  writer.releaseLock();
                }
              } catch (
                writeError
              ) {
                retried = true;

                await closeSerialPort(
                  port,
                );

                serialPortRef.current =
                  null;

                setSerialPort(
                  null,
                );

                setSerialConnected(
                  false,
                );

                const reconnected =
                  await connectPrinter();

                if (
                  !reconnected?.writable
                ) {
                  throw writeError;
                }

                const retryWriter =
                  reconnected.writable.getWriter();

                try {
                  await retryWriter.write(
                    payload,
                  );
                } finally {
                  retryWriter.releaseLock();
                }
              }
            },
          );

          setSerialConnected(
            true,
          );

          showSuccess(
            'Invoice printed',
            retried
              ? `${format} receipt printed after reconnecting the printer.`
              : `${format} receipt sent to the thermal printer.`,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Thermal Print',
            status: 'success',
            message:
              `${format} invoice printed for ${invoice.invoice_no}`,
          });
        } catch (err: any) {
          console.error(
            'Thermal print failed:',
            err,
          );

          setSerialConnected(
            false,
          );

          const raw =
            String(
              err?.message ||
                `Unable to print ${format} invoice.`,
            );

          let message = raw;

          if (
            /access denied|busy|in use|already open|invalid state|failed to open|open serial port/i.test(
              raw,
            )
          ) {
            message =
              'The printer COM port is unavailable or busy. Close software using the printer, reconnect it, and select the correct COM port.';
          } else if (
            /no writable thermal printer/i.test(
              raw,
            )
          ) {
            message =
              'No writable thermal printer is connected. Click Connect Printer and select the printer COM port.';
          }

          showError(
            'Thermal print failed',
            message,
          );

          addAppLog({
            module: 'Invoices',
            action:
              'Thermal Print',
            status: 'error',
            message,
          });
        } finally {
          setIsThermalPrinting(
            false,
          );
        }
      },
      [
        buildEscPosPayload,
        closeSerialPort,
        connectPrinter,
        generateTextReceipt,
        getConnectedPrinter,
        invoice,
        isMobile,
        isThermalPrinting,
        showError,
        showSuccess,
        withSerialLock,
      ],
    );

  /* =========================================================================
   * A4 PRINT
   * ======================================================================= */

  const printA4 =
    useCallback(() => {
      if (!invoice) {
        return;
      }

      if (
        typeof window ===
          'undefined' ||
        typeof document ===
          'undefined'
      ) {
        showError(
          'Print failed',
          'Browser printing is not available.',
        );

        return;
      }

      requestAnimationFrame(
        () => {
          window.setTimeout(
            () => {
              try {
                window.print();
              } catch (err: any) {
                console.error(
                  'A4 print failed:',
                  err,
                );

                showError(
                  'Print failed',
                  err?.message ||
                    'Unable to print invoice.',
                );
              }
            },
            150,
          );
        },
      );
    }, [
      invoice,
      showError,
    ]);

  /* =========================================================================
   * DEFAULT PRINT
   * ======================================================================= */

  const defaultPrinterFormat =
    normalizeFormat(
      printerSettings?.printer_default_format,
    );

  const handleDefaultPrint =
    useCallback(() => {
      if (
        !invoice ||
        isThermalPrinting
      ) {
        return;
      }

      if (
        defaultPrinterFormat ===
        '58mm'
      ) {
        void printThermal(
          '58mm',
        );
        return;
      }

      if (
        defaultPrinterFormat ===
        '80mm'
      ) {
        void printThermal(
          '80mm',
        );
        return;
      }

      printA4();
    }, [
      defaultPrinterFormat,
      invoice,
      isThermalPrinting,
      printA4,
      printThermal,
    ]);

  /* =========================================================================
   * LOADING STATE
   * ======================================================================= */

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 md:p-8">
        <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 bg-slate-300 rounded-xl" />
            <div className="h-8 w-56 bg-slate-300 rounded-lg" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Array.from({
              length: 5,
            }).map((_, index) => (
              <div
                key={index}
                className="bg-white rounded-xl p-5"
              >
                <div className="h-4 w-20 bg-slate-200 rounded mb-3" />
                <div className="h-7 w-28 bg-slate-200 rounded" />
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl p-6 h-64" />
        </div>
      </div>
    );
  }

  /* =========================================================================
   * ERROR STATE
   * ======================================================================= */

  if (
    error ||
    !invoice
  ) {
    return (
      <div className="min-h-screen bg-slate-100 p-4 md:p-8 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <FiAlertCircle
              size={28}
              className="text-rose-500"
            />
          </div>

          <h2 className="text-xl font-semibold text-slate-800 mb-2">
            Something went wrong
          </h2>

          <p className="text-slate-600 mb-6">
            {error ||
              'Invoice not found.'}
          </p>

          <Link
            to="/invoices"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-medium"
          >
            <FiArrowLeft size={16} />
            Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  /* =========================================================================
   * RENDER DATA
   * ======================================================================= */

  const status =
    invoice.status ||
    'draft';

  const statusStyle =
    statusConfig[status] ||
    statusConfig.draft;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 print:bg-white print:p-0">
      <div className="max-w-6xl mx-auto space-y-6 print:max-w-full">

        {/* ================================================================
            HEADER
        ================================================================= */}

        <section className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 md:p-8 text-white shadow-xl no-print">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    '/invoices',
                  )
                }
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition"
                aria-label="Back to invoices"
              >
                <FiArrowLeft size={20} />
              </button>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-2xl md:text-3xl font-bold">
                    Invoice{' '}
                    {
                      invoice.invoice_no
                    }
                  </h1>

                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${statusStyle.bg} ${statusStyle.text}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${statusStyle.dot}`}
                    />

                    {
                      statusStyle.icon
                    }

                    {status
                      .charAt(0)
                      .toUpperCase() +
                      status.slice(
                        1,
                      )}
                  </span>
                </div>

                <p className="text-sm text-slate-300 mt-1">
                  Created{' '}
                  {formatDateTimeSafe(
                    invoice.created_at,
                  )}
                  {' · '}
                  Due{' '}
                  {formatDateSafe(
                    invoice.due_date,
                  )}
                </p>
              </div>
            </div>

            {/* Right-aligned action buttons */}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() =>
                  setShowPrintSelector(
                    true,
                  )
                }
                disabled={
                  isThermalPrinting
                }
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-sm font-medium flex items-center gap-2 disabled:opacity-50"
              >
                <FiPrinter size={16} />
                Print
              </button>

              <button
                type="button"
                onClick={
                  handleWhatsAppShare
                }
                className="px-4 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 text-white text-sm font-medium flex items-center gap-2"
              >
                <FiShare2 size={16} />
                Share
              </button>

              <Link
                to={`/invoices/${invoice.id}/edit`}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-900 text-sm font-semibold flex items-center gap-2"
              >
                <FiEdit2 size={16} />
                Edit
              </Link>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span className="text-slate-300">
                Payment Progress
              </span>

              <span className="font-semibold">
                {paymentProgress.toFixed(
                  0,
                )}
                %
              </span>
            </div>

            <div className="h-2 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                style={{
                  width: `${paymentProgress}%`,
                }}
              />
            </div>

            <div className="mt-2 flex justify-between text-xs text-slate-300">
              <span>
                Paid: Rs{' '}
                {paidAmount.toFixed(
                  2,
                )}
              </span>

              <span>
                Total: Rs{' '}
                {totalAmount.toFixed(
                  2,
                )}
              </span>
            </div>
          </div>
        </section>

        {/* ================================================================
            STATS
        ================================================================= */}

        <section className="grid grid-cols-2 md:grid-cols-5 gap-4 no-print">
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <FiFileText size={14} />
              Total
            </div>

            <div className="text-xl font-bold text-slate-800">
              Rs{' '}
              {totalAmount.toFixed(
                2,
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-emerald-600 mb-2">
              <FiCheckCircle size={14} />
              Paid
            </div>

            <div className="text-xl font-bold text-emerald-600">
              Rs{' '}
              {paidAmount.toFixed(
                2,
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-rose-500 mb-2">
              <FiAlertCircle size={14} />
              Remaining
            </div>

            <div
              className={`text-xl font-bold ${
                remainingAmount >
                0
                  ? 'text-rose-500'
                  : 'text-emerald-600'
              }`}
            >
              Rs{' '}
              {remainingAmount.toFixed(
                2,
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <FiTrendingUp size={14} />
              Status
            </div>

            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium ${statusStyle.bg} ${statusStyle.text}`}
            >
              {
                statusStyle.icon
              }

              {status
                .charAt(0)
                .toUpperCase() +
                status.slice(1)}
            </span>
          </div>

          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
              <FiPlus size={14} />
              Action
            </div>

            {isFullyPaid ? (
              <p className="text-sm text-emerald-600 font-semibold">
                Fully paid
              </p>
            ) : (
              <button
                type="button"
                onClick={
                  markInvoicePaid
                }
                disabled={
                  submittingPayment
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-sm font-medium disabled:opacity-50"
              >
                <FiCheckCircle size={14} />
                Mark Paid
              </button>
            )}
          </div>
        </section>

        {/* ================================================================
            MAIN
        ================================================================= */}

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">

          {/* INVOICE INFO */}

          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-5">
                <FiFileText className="text-blue-500" />
                Invoice Details
              </h2>

              <dl className="space-y-4">
                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-slate-500 flex items-center gap-2">
                    <FiHash size={14} />
                    Invoice Number
                  </dt>

                  <dd className="text-sm font-medium text-slate-700 text-right">
                    {
                      invoice.invoice_no
                    }
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-slate-500 flex items-center gap-2">
                    <FiCalendar size={14} />
                    Created
                  </dt>

                  <dd className="text-sm text-slate-700 text-right">
                    {formatDateTimeSafe(
                      invoice.created_at,
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-slate-500 flex items-center gap-2">
                    <FiClock size={14} />
                    Due Date
                  </dt>

                  <dd className="text-sm text-slate-700 text-right">
                    {formatDateSafe(
                      invoice.due_date,
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-4">
                  <dt className="text-sm text-slate-500 flex items-center gap-2">
                    <FiTrendingUp size={14} />
                    Status
                  </dt>

                  <dd
                    className={`text-sm font-medium ${statusStyle.text}`}
                  >
                    {status
                      .charAt(0)
                      .toUpperCase() +
                      status.slice(
                        1,
                      )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* CUSTOMER (Enhanced) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-5">
                <FiUser className="text-indigo-500" />
                Customer
              </h2>

              <div className="space-y-4">
                {/* Name & Contact Person */}
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-sm font-bold">
                    {(invoice.customer?.name || 'W')[0].toUpperCase()}
                  </span>
                  <div>
                    <span className="text-slate-700 font-medium block">
                      {invoice.customer?.name || 'Walk-in'}
                    </span>
                    {invoice.contact_person && (
                      <span className="text-xs text-slate-500">
                        Contact: {invoice.contact_person}
                      </span>
                    )}
                  </div>
                </div>

                {/* Phone */}
                {invoice.customer?.phone || invoice.contact_no ? (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <FiPhone size={14} />
                    {invoice.customer?.phone || invoice.contact_no}
                  </p>
                ) : null}

                {/* Email */}
                {invoice.customer?.email && (
                  <p className="text-sm text-slate-600 flex items-center gap-2">
                    <FiMail size={14} />
                    {invoice.customer.email}
                  </p>
                )}

                {/* GSTIN / PAN */}
                {invoice.gstin || invoice.pan || invoice.gstin_pan ? (
                  <div className="flex items-start gap-2">
                    <FiFileText size={14} className="mt-1 text-slate-400" />
                    <div className="text-sm text-slate-600">
                      {invoice.gstin || invoice.pan || invoice.gstin_pan}
                    </div>
                  </div>
                ) : null}

                {/* Billing Address */}
                {invoice.billing_street || invoice.billing_city || invoice.billing_state || invoice.billing_pincode ? (
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <h3 className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Billing Address
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {[
                        invoice.billing_street,
                        invoice.billing_city,
                        invoice.billing_state,
                        invoice.billing_pincode,
                        invoice.billing_country,
                      ].filter(Boolean).join(', ')}
                    </p>
                  </div>
                ) : null}

                {/* Shipping Address */}
                {invoice.shipping_street || invoice.shipping_city || invoice.shipping_state || invoice.shipping_pincode ? (
                  <div className="rounded-lg bg-slate-50 p-3 border border-slate-100">
                    <h3 className="text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">
                      Shipping Address
                    </h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {[
                        invoice.shipping_street,
                        invoice.shipping_city,
                        invoice.shipping_state,
                        invoice.shipping_pincode,
                        invoice.shipping_country,
                      ].filter(Boolean).join(', ')}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* ITEMS */}

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <FiFileText className="text-emerald-500" />
                Items
              </h2>

              <span className="text-sm text-slate-500">
                {
                  invoice.items
                    ?.length || 0
                }{' '}
                item(s)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 text-left">
                      Product
                    </th>

                    <th className="px-4 py-3 text-right">
                      Qty
                    </th>

                    <th className="px-4 py-3 text-right">
                      Unit Price
                    </th>

                    <th className="px-4 py-3 text-right">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {invoice.items &&
                  invoice.items.length >
                    0 ? (
                    invoice.items.map(
                      (
                        item: InvoiceItem,
                      ) => (
                        <tr
                          key={
                            item.id
                          }
                          className="border-b border-slate-100"
                        >
                          <td className="px-4 py-3 text-slate-700">
                            {item.product
                              ?.name ||
                              `Product #${item.product_id}`}
                          </td>

                          <td className="px-4 py-3 text-right text-slate-700">
                            {
                              item.quantity
                            }
                          </td>

                          <td className="px-4 py-3 text-right text-slate-700">
                            Rs{' '}
                            {safeNumber(
                              item.unit_price,
                            ).toFixed(
                              2,
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-medium text-slate-800">
                            Rs{' '}
                            {safeNumber(
                              item.total,
                            ).toFixed(
                              2,
                            )}
                          </td>
                        </tr>
                      ),
                    )
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-12 text-center text-slate-400"
                      >
                        No items found.
                      </td>
                    </tr>
                  )}
                </tbody>

                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right font-medium text-slate-600"
                    >
                      Items Total
                    </td>

                    <td className="px-4 py-3 text-right font-bold text-slate-800">
                      Rs{' '}
                      {itemsTotal.toFixed(
                        2,
                      )}
                    </td>
                  </tr>

                  {discountAmount >
                    0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-right text-rose-600"
                      >
                        Discount
                      </td>

                      <td className="px-4 py-2 text-right text-rose-600">
                        -Rs{' '}
                        {discountAmount.toFixed(
                          2,
                        )}
                      </td>
                    </tr>
                  )}

                  {taxAmount >
                    0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-2 text-right text-slate-600"
                      >
                        Tax
                      </td>

                      <td className="px-4 py-2 text-right text-slate-700">
                        Rs{' '}
                        {taxAmount.toFixed(
                          2,
                        )}
                      </td>
                    </tr>
                  )}

                  <tr className="border-t-2 border-slate-300">
                    <td
                      colSpan={3}
                      className="px-4 py-3 text-right font-bold"
                    >
                      Grand Total
                    </td>

                    <td className="px-4 py-3 text-right font-bold text-lg">
                      Rs{' '}
                      {totalAmount.toFixed(
                        2,
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </section>

        {/* ================================================================
            PAYMENTS
        ================================================================= */}

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden no-print">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <FiCreditCard className="text-purple-500" />
              Payments
            </h2>

            <span className="text-sm text-slate-500">
              {
                invoice.payments
                  ?.length || 0
              }{' '}
              record(s)
            </span>
          </div>

          <div className="p-6">
            {invoice.payments &&
            invoice.payments.length >
              0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 text-left">
                        Reference
                      </th>

                      <th className="px-4 py-3 text-right">
                        Amount
                      </th>

                      <th className="px-4 py-3 text-left">
                        Method
                      </th>

                      <th className="px-4 py-3 text-left">
                        Date
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {invoice.payments.map(
                      (
                        payment: Payment,
                      ) => (
                        <tr
                          key={
                            payment.id
                          }
                          className="border-b border-slate-100"
                        >
                          <td className="px-4 py-3 text-slate-700">
                            {
                              payment.reference_no
                            }
                          </td>

                          <td className="px-4 py-3 text-right font-medium">
                            Rs{' '}
                            {safeNumber(
                              payment.amount,
                            ).toFixed(
                              2,
                            )}
                          </td>

                          <td className="px-4 py-3 capitalize">
                            {
                              payment.payment_method
                            }
                          </td>

                          <td className="px-4 py-3">
                            {formatDateSafe(
                              payment.created_at,
                            )}
                          </td>
                        </tr>
                      ),
                    )}

                    <tr className="border-t-2 border-slate-200">
                      <td className="px-4 py-3 font-semibold">
                        Total Paid
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        Rs{' '}
                        {paidAmount.toFixed(
                          2,
                        )}
                      </td>

                      <td colSpan={2} />
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400">
                No payments recorded yet.
              </div>
            )}

            {!isFullyPaid && (
              <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <h3 className="font-semibold text-slate-800 mb-4">
                  Record a Payment
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Amount
                    </label>

                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      max={
                        remainingAmount
                      }
                      value={
                        paymentAmount
                      }
                      onChange={(
                        event,
                      ) =>
                        setPaymentAmount(
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        submittingPayment
                      }
                      placeholder={`Max Rs ${remainingAmount.toFixed(
                        2,
                      )}`}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                    />

                    <p className="mt-1 text-xs text-slate-500">
                      Remaining: Rs{' '}
                      {remainingAmount.toFixed(
                        2,
                      )}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Payment Method
                    </label>

                    <select
                      value={
                        paymentMethod
                      }
                      onChange={(
                        event,
                      ) =>
                        setPaymentMethod(
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        submittingPayment
                      }
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                    >
                      {PAYMENT_METHODS.map(
                        (
                          method,
                        ) => (
                          <option
                            key={
                              method.value
                            }
                            value={
                              method.value
                            }
                          >
                            {
                              method.label
                            }
                          </option>
                        ),
                      )}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={
                        createPayment
                      }
                      disabled={
                        submittingPayment ||
                        !paymentAmount ||
                        Number.parseFloat(
                          paymentAmount,
                        ) <= 0
                      }
                      className="w-full px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <FiPlus size={16} />

                      {submittingPayment
                        ? 'Processing...'
                        : 'Add Payment'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isFullyPaid && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 flex items-center gap-2 text-sm font-medium">
                <FiCheckCircle size={18} />
                This invoice is fully paid.
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ================================================================
          A4 PRINT AREA
      ================================================================= */}

      <div
        id="print-a4-area"
        style={{
          display: 'none',
        }}
      >
        <InvoicePrintA4
          invoice={invoice}
        />
      </div>

      {/* ================================================================
          PRINT SELECTOR
      ================================================================= */}

      {showPrintSelector && (
        <div
          className="fixed inset-0 z-[100] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Invoice print options"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setShowPrintSelector(
                false,
              );
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Print Invoice
                </h2>

                <p className="text-sm text-slate-500 mt-1">
                  Invoice{' '}
                  {
                    invoice.invoice_no
                  }
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowPrintSelector(
                    false,
                  )
                }
                className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* PRINTER STATUS */}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    Thermal Printer
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    {isMobile
                      ? 'Android · RawBT'
                      : serialConnected
                        ? 'Connected · ESC/POS · 9600 baud'
                        : 'Not connected · Web Serial'}
                  </p>
                </div>

                {!isMobile && (
                  <button
                    type="button"
                    onClick={() =>
                      void connectPrinter()
                    }
                    disabled={
                      serialConnecting ||
                      isThermalPrinting
                    }
                    className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <FiPrinter size={15} />

                    {serialConnecting
                      ? 'Connecting…'
                      : serialConnected
                        ? 'Reconnect Printer'
                        : 'Connect Printer'}
                  </button>
                )}
              </div>

              {/* FORMAT OPTIONS */}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowPrintSelector(
                      false,
                    );
                    printA4();
                  }}
                  className="rounded-xl border border-slate-200 p-4 text-left hover:bg-slate-50 hover:border-slate-400 transition"
                >
                  <div className="font-semibold text-slate-900">
                    A4
                  </div>

                  <div className="text-xs text-slate-500 mt-1">
                    Browser print / PDF
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPrintSelector(
                      false,
                    );
                    void printThermal(
                      '58mm',
                    );
                  }}
                  disabled={
                    isThermalPrinting
                  }
                  className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-left hover:bg-emerald-50 transition disabled:opacity-50"
                >
                  <div className="font-semibold text-emerald-800">
                    58mm Thermal
                  </div>

                  <div className="text-xs text-emerald-700 mt-1">
                    Full item names · ESC/POS
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowPrintSelector(
                      false,
                    );
                    void printThermal(
                      '80mm',
                    );
                  }}
                  disabled={
                    isThermalPrinting
                  }
                  className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 text-left hover:bg-blue-50 transition disabled:opacity-50"
                >
                  <div className="font-semibold text-blue-800">
                    80mm Thermal
                  </div>

                  <div className="text-xs text-blue-700 mt-1">
                    Full item names · ESC/POS
                  </div>
                </button>
              </div>

              {/* PREVIEW */}

              {(defaultPrinterFormat ===
                '58mm' ||
                defaultPrinterFormat ===
                  '80mm') && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700">
                      Receipt Preview
                    </span>

                    <span className="text-xs text-slate-500">
                      Default:{' '}
                      {
                        defaultPrinterFormat
                      }
                    </span>
                  </div>

                  <pre className="max-h-96 overflow-auto p-4 bg-white text-[11px] leading-[1.4] font-mono whitespace-pre-wrap text-slate-800">
{generateTextReceipt(
  defaultPrinterFormat,
  invoice,
)}
                  </pre>
                </div>
              )}

              {/* PRINTING NOTE */}

              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-xs text-cyan-800 leading-5">
                <strong>
                  58mm item-name mode:
                </strong>{' '}
                the complete product name is
                rendered as one thermal graphics
                line. It is not truncated and not
                wrapped. Long names are compressed
                horizontally to fit the selected
                printer width.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================
          PRINT CSS
      ================================================================= */}

      <style>{`
        @media print {
          @page {
            margin: 0;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          #print-a4-area,
          #print-a4-area * {
            visibility: visible !important;
          }

          #print-a4-area {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .no-print {
            display: none !important;
          }

          * {
            animation: none !important;
            transition: none !important;
            box-shadow: none !important;
          }

          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
        }
      `}</style>
    </div>
  );
}