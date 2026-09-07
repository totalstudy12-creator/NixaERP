import type { Invoice, Payment } from '../types';

export type PrintFormat = '58mm' | '80mm';

export type ThermalPrinterMode =
  | 'bluetooth'
  | 'local';

/* ============================================================
 * TYPES
 * ========================================================== */

type WritableCharacteristic =
  BluetoothRemoteGATTCharacteristic & {
    writeValueWithoutResponse?: (
      value: BufferSource
    ) => Promise<void>;
  };

interface PrinterConnection {
  device: BluetoothDevice;
  server: BluetoothRemoteGATTServer;
  characteristic: WritableCharacteristic;
}

/* ============================================================
 * CONFIGURATION
 * ========================================================== */

const CONFIG = {
  bleChunkSize: 100,
  bleChunkDelay: 40,
  printFinishDelay: 1200,
  connectionDelay: 500,
  localBridgeUrl:
    import.meta.env.VITE_THERMAL_PRINT_BRIDGE_URL ||
    'http://127.0.0.1:9100',
};

/* ============================================================
 * COMMON BLE SERVICE UUIDS
 * ========================================================== */

const COMMON_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '000018f1-0000-1000-8000-00805f9b34fb',
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
];

/* ============================================================
 * COMMON BLE CHARACTERISTICS
 * ========================================================== */

const COMMON_CHARACTERISTIC_UUIDS = [
  '00002af1-0000-1000-8000-00805f9b34fb',
  '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
];

/* ============================================================
 * PAPER WIDTH
 * ========================================================== */

const PAPER_WIDTH = {
  '58mm': 32,
  '80mm': 48,
};

/* ============================================================
 * BASIC HELPERS
 * ========================================================== */

const sleep = (
  ms: number
): Promise<void> =>
  new Promise(resolve =>
    setTimeout(resolve, ms)
  );

const numberValue = (
  value: unknown
): number => {
  const n = Number(value);

  return Number.isFinite(n)
    ? n
    : 0;
};

const money = (
  value: unknown
): string =>
  numberValue(value).toFixed(2);

const cleanText = (
  value: unknown
): string => {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/\n/g, ' ')
    .replace(/[^\x20-\x7E]/g, '');
};

/* ============================================================
 * TEXT HELPERS
 * ========================================================== */

const repeat = (
  character: string,
  count: number
): string => {
  return character.repeat(
    Math.max(0, count)
  );
};

const separator = (
  width: number
): string =>
  repeat('-', width);

const center = (
  value: string,
  width: number
): string => {
  const text =
    cleanText(value);

  if (
    text.length >= width
  ) {
    return text.substring(
      0,
      width
    );
  }

  const padding =
    Math.floor(
      (width - text.length) / 2
    );

  return (
    repeat(' ', padding) +
    text
  );
};

const columns = (
  left: string,
  right: string,
  width: number
): string => {
  const l =
    cleanText(left);

  const r =
    cleanText(right);

  if (
    r.length >= width
  ) {
    return r.substring(
      0,
      width
    );
  }

  const availableLeft =
    width -
    r.length -
    1;

  if (
    availableLeft <= 0
  ) {
    return r;
  }

  const leftValue =
    l.length >
    availableLeft
      ? l.substring(
          0,
          availableLeft
        )
      : l;

  const spaces =
    width -
    leftValue.length -
    r.length;

  return (
    leftValue +
    repeat(' ', spaces) +
    r
  );
};

const wrapText = (
  value: string,
  width: number
): string[] => {
  const text =
    cleanText(value).trim();

  if (!text) {
    return [''];
  }

  if (
    text.length <= width
  ) {
    return [text];
  }

  const words =
    text.split(/\s+/);

  const result: string[] = [];

  let current = '';

  for (
    const word of words
  ) {
    /*
     * Handle words longer than paper width.
     */
    if (
      word.length > width
    ) {
      if (current) {
        result.push(current);
        current = '';
      }

      for (
        let i = 0;
        i < word.length;
        i += width
      ) {
        result.push(
          word.substring(
            i,
            i + width
          )
        );
      }

      continue;
    }

    if (!current) {
      current = word;
      continue;
    }

    const candidate =
      `${current} ${word}`;

    if (
      candidate.length <= width
    ) {
      current = candidate;
    } else {
      result.push(current);
      current = word;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
};

/* ============================================================
 * ESC/POS COMMANDS
 * ========================================================== */

const ESC = 0x1b;
const GS = 0x1d;

const ESC_POS = {
  INIT: [
    ESC,
    0x40,
  ],

  ALIGN_LEFT: [
    ESC,
    0x61,
    0x00,
  ],

  ALIGN_CENTER: [
    ESC,
    0x61,
    0x01,
  ],

  ALIGN_RIGHT: [
    ESC,
    0x61,
    0x02,
  ],

  BOLD_ON: [
    ESC,
    0x45,
    0x01,
  ],

  BOLD_OFF: [
    ESC,
    0x45,
    0x00,
  ],

  NORMAL: [
    ESC,
    0x21,
    0x00,
  ],

  FEED_3: [
    ESC,
    0x64,
    0x03,
  ],

  FEED_5: [
    ESC,
    0x64,
    0x05,
  ],

  CUT: [
    GS,
    0x56,
    0x42,
    0x00,
  ],
};

/* ============================================================
 * GENERATE ESC/POS
 * ========================================================== */

export function generateEscPos(
  invoice: Invoice,
  format: PrintFormat
): Uint8Array {
  const encoder =
    new TextEncoder();

  const width =
    PAPER_WIDTH[format];

  const bytes: number[] = [];

  const command = (
    value: number[]
  ) => {
    bytes.push(...value);
  };

  const line = (
    value = ''
  ) => {
    bytes.push(
      ...encoder.encode(
        `${cleanText(value)}\n`
      )
    );
  };

  /* ----------------------------------------------------------
   * INIT
   * -------------------------------------------------------- */

  command(
    ESC_POS.INIT
  );

  command(
    ESC_POS.NORMAL
  );

  /* ----------------------------------------------------------
   * HEADER
   * -------------------------------------------------------- */

  command(
    ESC_POS.ALIGN_CENTER
  );

  command(
    ESC_POS.BOLD_ON
  );

  line('NIXA ERP');

  command(
    ESC_POS.BOLD_OFF
  );

  line(
    'Your Business Address'
  );

  line(
    'Phone: +91-XXXXXXXXXX'
  );

  line(
    'GSTIN: XXXXXXXXXXXXXXX'
  );

  line(
    separator(width)
  );

  /* ----------------------------------------------------------
   * INVOICE INFORMATION
   * -------------------------------------------------------- */

  command(
    ESC_POS.ALIGN_LEFT
  );

  line(
    columns(
      'Invoice #',
      invoice.invoice_no || '',
      width
    )
  );

  const invoiceDate =
    invoice.created_at
      ? new Date(
          invoice.created_at
        ).toLocaleDateString(
          'en-IN'
        )
      : '';

  line(
    columns(
      'Date',
      invoiceDate,
      width
    )
  );

  line(
    separator(width)
  );

  /* ----------------------------------------------------------
   * CUSTOMER
   * -------------------------------------------------------- */

  command(
    ESC_POS.BOLD_ON
  );

  line(
    'Bill To:'
  );

  command(
    ESC_POS.BOLD_OFF
  );

  line(
    invoice.customer?.name ||
      'Walk-in Customer'
  );

  if (
    invoice.customer?.phone
  ) {
    line(
      `Ph: ${invoice.customer.phone}`
    );
  }

  line(
    separator(width)
  );

  /* ----------------------------------------------------------
   * ITEMS
   * -------------------------------------------------------- */

  command(
    ESC_POS.BOLD_ON
  );

  line('ITEMS');

  command(
    ESC_POS.BOLD_OFF
  );

  for (
    const item of
      invoice.items || []
  ) {
    const productName =
      item.product?.name ||
      `Product #${item.product_id}`;

    const quantity =
      numberValue(
        item.quantity
      );

    const rate =
      money(
        item.unit_price
      );

    const total =
      money(
        item.total
      );

    const nameLines =
      wrapText(
        productName,
        width
      );

    for (
      const name of nameLines
    ) {
      line(name);
    }

    line(
      columns(
        `${quantity} x ${rate}`,
        total,
        width
      )
    );
  }

  /* ----------------------------------------------------------
   * TOTALS
   * -------------------------------------------------------- */

  line(
    separator(width)
  );

  const totalAmount =
    numberValue(
      invoice.total_amount
    );

  const taxAmount =
    numberValue(
      invoice.tax_amount
    );

  const discountAmount =
    numberValue(
      invoice.discount_amount
    );

  const paidAmount =
    (
      invoice.payments || []
    ).reduce(
      (
        sum: number,
        payment: Payment
      ) =>
        sum +
        numberValue(
          payment.amount
        ),
      0
    );

  /*
   * total =
   * subtotal - discount + tax
   *
   * subtotal =
   * total - tax + discount
   */
  const subtotal =
    totalAmount -
    taxAmount +
    discountAmount;

  const balance =
    Math.max(
      0,
      totalAmount -
        paidAmount
    );

  line(
    columns(
      'Subtotal',
      money(subtotal),
      width
    )
  );

  if (
    discountAmount > 0
  ) {
    line(
      columns(
        'Discount',
        `-${money(
          discountAmount
        )}`,
        width
      )
    );
  }

  line(
    columns(
      'Tax',
      money(taxAmount),
      width
    )
  );

  line(
    separator(width)
  );

  /* ----------------------------------------------------------
   * GRAND TOTAL
   * -------------------------------------------------------- */

  command(
    ESC_POS.BOLD_ON
  );

  line(
    columns(
      'TOTAL',
      money(totalAmount),
      width
    )
  );

  command(
    ESC_POS.BOLD_OFF
  );

  line(
    columns(
      'Paid',
      money(paidAmount),
      width
    )
  );

  line(
    columns(
      'Balance',
      money(balance),
      width
    )
  );

  line(
    separator(width)
  );

  /* ----------------------------------------------------------
   * STATUS
   * -------------------------------------------------------- */

  command(
    ESC_POS.ALIGN_CENTER
  );

  command(
    ESC_POS.BOLD_ON
  );

  if (
    balance <= 0.009
  ) {
    line(
      '*** PAID ***'
    );
  } else {
    line(
      'BALANCE DUE'
    );

    line(
      money(balance)
    );
  }

  command(
    ESC_POS.BOLD_OFF
  );

  line(
    separator(width)
  );

  /* ----------------------------------------------------------
   * FOOTER
   * -------------------------------------------------------- */

  line(
    'Thank you for your business!'
  );

  line(
    'Powered by NIXA ERP'
  );

  /*
   * Feed before cut.
   */
  command(
    ESC_POS.FEED_5
  );

  /*
   * Cut paper where supported.
   */
  command(
    ESC_POS.CUT
  );

  return new Uint8Array(
    bytes
  );
}

/* ============================================================
 * BLUETOOTH SUPPORT
 * ========================================================== */

export const isBluetoothSupported =
  (): boolean => {
    return (
      typeof navigator !==
        'undefined' &&
      'bluetooth' in navigator
    );
  };

/* ============================================================
 * REQUEST BLUETOOTH PRINTER
 * ========================================================== */

async function requestBluetoothPrinter():
  Promise<BluetoothDevice> {
  if (
    !isBluetoothSupported()
  ) {
    throw new Error(
      'Web Bluetooth is not supported. Use Google Chrome or Microsoft Edge.'
    );
  }

  try {
    const device =
      await navigator.bluetooth.requestDevice(
        {
          /*
           * Do not restrict the picker to only 18F0.
           */
          acceptAllDevices: true,

          optionalServices: [
            ...COMMON_SERVICE_UUIDS,

            '00001800-0000-1000-8000-00805f9b34fb',

            '00001801-0000-1000-8000-00805f9b34fb',
          ],
        }
      );

    console.log(
      '[NIXA ERP] Selected printer:',
      device.name,
      device.id
    );

    return device;
  } catch (
    error: any
  ) {
    if (
      error?.name ===
      'NotFoundError'
    ) {
      throw new Error(
        'Bluetooth printer selection was cancelled.'
      );
    }

    throw new Error(
      error?.message ||
        'Unable to select Bluetooth printer.'
    );
  }
}

/* ============================================================
 * FIND WRITABLE CHARACTERISTIC
 * ========================================================== */

async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer
): Promise<WritableCharacteristic> {
  if (
    !server.connected
  ) {
    throw new Error(
      'GATT server is disconnected before service discovery.'
    );
  }

  console.log(
    '[NIXA ERP] Searching GATT services...'
  );

  /*
   * Search common services.
   */
  for (
    const serviceUuid
    of COMMON_SERVICE_UUIDS
  ) {
    try {
      const service =
        await server.getPrimaryService(
          serviceUuid
        );

      console.log(
        '[NIXA ERP] Found service:',
        service.uuid
      );

      const characteristics =
        await service.getCharacteristics();

      for (
        const characteristic
        of characteristics
      ) {
        console.log(
          '[NIXA ERP] Characteristic:',
          characteristic.uuid,
          characteristic.properties
        );

        if (
          characteristic.properties
            .writeWithoutResponse ||
          characteristic.properties.write
        ) {
          console.log(
            '[NIXA ERP] Writable characteristic:',
            characteristic.uuid
          );

          return characteristic as WritableCharacteristic;
        }
      }
    } catch {
      /*
       * Service not exposed by this printer.
       */
    }
  }

  /*
   * Try explicit characteristic UUIDs.
   */
  for (
    const serviceUuid
    of COMMON_SERVICE_UUIDS
  ) {
    try {
      const service =
        await server.getPrimaryService(
          serviceUuid
        );

      for (
        const characteristicUuid
        of COMMON_CHARACTERISTIC_UUIDS
      ) {
        try {
          const characteristic =
            await service.getCharacteristic(
              characteristicUuid
            );

          if (
            characteristic.properties
              .writeWithoutResponse ||
            characteristic.properties.write
          ) {
            return characteristic as WritableCharacteristic;
          }
        } catch {
          /*
           * Continue.
           */
        }
      }
    } catch {
      /*
       * Continue.
       */
    }
  }

  throw new Error(
    'Bluetooth connected, but no writable BLE/GATT characteristic was found. This printer may be Bluetooth Classic/SPP or may use a proprietary BLE protocol.'
  );
}

/* ============================================================
 * CONNECT BLUETOOTH PRINTER
 * ========================================================== */

async function connectBluetoothPrinter(
  device: BluetoothDevice
): Promise<PrinterConnection> {
  if (
    !device.gatt
  ) {
    throw new Error(
      'The selected printer does not expose Bluetooth GATT. It is likely a Bluetooth Classic/SPP printer.'
    );
  }

  let server =
    device.gatt;

  /*
   * Initial connection.
   */
  try {
    if (
      !server.connected
    ) {
      server =
        await device.gatt.connect();
    }
  } catch (
    error: any
  ) {
    throw new Error(
      `Unable to connect to printer: ${
        error?.message ||
        'GATT connection failed'
      }`
    );
  }

  /*
   * Let BLE connection settle.
   */
  await sleep(
    CONFIG.connectionDelay
  );

  /*
   * Check connection.
   */
  if (
    !server.connected
  ) {
    console.warn(
      '[NIXA ERP] Printer disconnected after connection. Retrying...'
    );

    try {
      server =
        await device.gatt.connect();

      await sleep(
        CONFIG.connectionDelay
      );
    } catch {
      throw new Error(
        'Printer disconnected immediately after connecting.'
      );
    }
  }

  if (
    !server.connected
  ) {
    throw new Error(
      'GATT server is disconnected.'
    );
  }

  /*
   * Find write characteristic.
   */
  let characteristic:
    WritableCharacteristic;

  try {
    characteristic =
      await findWritableCharacteristic(
        server
      );
  } catch (
    error: any
  ) {
    /*
     * One clean reconnect.
     */
    console.warn(
      '[NIXA ERP] Characteristic discovery failed. Reconnecting...'
    );

    try {
      if (
        device.gatt.connected
      ) {
        device.gatt.disconnect();
      }

      await sleep(500);

      server =
        await device.gatt.connect();

      await sleep(
        CONFIG.connectionDelay
      );

      characteristic =
        await findWritableCharacteristic(
          server
        );
    } catch {
      throw new Error(
        error?.message ||
          'No writable printer characteristic found.'
      );
    }
  }

  return {
    device,
    server,
    characteristic,
  };
}

/* ============================================================
 * WRITE ONE CHUNK
 * ========================================================== */

async function writeChunk(
  characteristic: WritableCharacteristic,
  data: Uint8Array
): Promise<void> {
  /*
   * Prefer Write Without Response.
   */
  if (
    characteristic.properties
      .writeWithoutResponse &&
    typeof characteristic
      .writeValueWithoutResponse ===
      'function'
  ) {
    await characteristic.writeValueWithoutResponse(
      data as BufferSource
    );

    return;
  }

  /*
   * Fallback.
   */
  if (
    characteristic.properties.write
  ) {
    await characteristic.writeValue(
      data as BufferSource
    );

    return;
  }

  throw new Error(
    'Printer characteristic is not writable.'
  );
}

/* ============================================================
 * SEND ESC/POS DATA
 * ========================================================== */

async function sendEscPos(
  connection: PrinterConnection,
  data: Uint8Array
): Promise<void> {
  const {
    server,
    characteristic,
  } = connection;

  const chunkSize =
    CONFIG.bleChunkSize;

  for (
    let offset = 0;
    offset < data.length;
    offset += chunkSize
  ) {
    /*
     * Verify connection before every packet.
     */
    if (
      !server.connected
    ) {
      throw new Error(
        `Printer disconnected while printing at byte ${offset}.`
      );
    }

    const chunk =
      data.slice(
        offset,
        Math.min(
          offset +
            chunkSize,
          data.length
        )
      );

    let success = false;

    /*
     * First attempt.
     */
    try {
      await writeChunk(
        characteristic,
        chunk
      );

      success = true;
    } catch (
      firstError
    ) {
      console.warn(
        '[NIXA ERP] Packet write failed. Retrying...',
        firstError
      );
    }

    /*
     * Retry.
     */
    if (!success) {
      await sleep(150);

      if (
        !server.connected
      ) {
        throw new Error(
          'Printer disconnected while retrying data.'
        );
      }

      try {
        await writeChunk(
          characteristic,
          chunk
        );

        success = true;
      } catch (
        error: any
      ) {
        throw new Error(
          `Printer rejected packet at byte ${offset}: ${
            error?.message ||
            'BLE write failed'
          }`
        );
      }
    }

    /*
     * Prevent cheap printers from being flooded.
     */
    await sleep(
      CONFIG.bleChunkDelay
    );
  }

  /*
   * Allow printer to finish processing.
   */
  await sleep(
    CONFIG.printFinishDelay
  );
}

/* ============================================================
 * BLUETOOTH PRINT
 * ========================================================== */

export const printThermalBluetooth =
  async (
    invoice: Invoice,
    format: PrintFormat
  ): Promise<void> => {
    if (
      !isBluetoothSupported()
    ) {
      throw new Error(
        'Web Bluetooth is not supported in this browser.'
      );
    }

    let connection:
      | PrinterConnection
      | null = null;

    try {
      /*
       * Select printer.
       */
      const device =
        await requestBluetoothPrinter();

      /*
       * Connect.
       */
      connection =
        await connectBluetoothPrinter(
          device
        );

      /*
       * Generate ESC/POS.
       */
      const data =
        generateEscPos(
          invoice,
          format
        );

      console.log(
        `[NIXA ERP] Printing ${data.length} bytes`
      );

      /*
       * Send.
       */
      await sendEscPos(
        connection,
        data
      );

      console.log(
        '[NIXA ERP] Bluetooth print completed.'
      );
    } catch (
      error: any
    ) {
      console.error(
        '[NIXA ERP] Bluetooth print failed:',
        error
      );

      throw new Error(
        error?.message ||
          'Bluetooth printing failed.'
      );
    } finally {
      /*
       * Disconnect only after printing is complete.
       */
      try {
        if (
          connection?.device?.gatt
            ?.connected
        ) {
          await sleep(300);

          connection.device.gatt.disconnect();
        }
      } catch {
        /*
         * Ignore disconnect errors.
         */
      }
    }
  };

/* ============================================================
 * LOCAL WINDOWS PRINT BRIDGE
 * ========================================================== */

export const printThermalLocal =
  async (
    invoice: Invoice,
    format: PrintFormat
  ): Promise<void> => {
    const data =
      generateEscPos(
        invoice,
        format
      );

    const response =
      await fetch(
        `${CONFIG.localBridgeUrl}/print`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            format,
            data:
              Array.from(data),
          }),
        }
      );

    if (
      !response.ok
    ) {
      let message =
        `Print bridge returned HTTP ${response.status}`;

      try {
        const body =
          await response.json();

        if (
          body?.message
        ) {
          message =
            body.message;
        }
      } catch {
        /*
         * Ignore invalid JSON.
         */
      }

      throw new Error(
        message
      );
    }
  };

/* ============================================================
 * AUTO PRINT
 * ========================================================== */

export const printThermal =
  async (
    invoice: Invoice,
    format: PrintFormat,
    mode: ThermalPrinterMode = 'bluetooth'
  ): Promise<void> => {
    if (!invoice) {
      throw new Error(
        'Invoice data is missing.'
      );
    }

    if (
      format !== '58mm' &&
      format !== '80mm'
    ) {
      throw new Error(
        'Invalid thermal printer format.'
      );
    }

    if (
      mode === 'local'
    ) {
      await printThermalLocal(
        invoice,
        format
      );

      return;
    }

    await printThermalBluetooth(
      invoice,
      format
    );
  };

/* ============================================================
 * EXISTING BLUETOOTH DEVICES
 * ========================================================== */

export const getPreviouslyAuthorizedPrinters =
  async (): Promise<BluetoothDevice[]> => {
    if (
      !isBluetoothSupported()
    ) {
      return [];
    }

    const bluetooth =
      navigator.bluetooth as Bluetooth & {
        getDevices?: () =>
          Promise<BluetoothDevice[]>;
      };

    if (
      typeof bluetooth.getDevices !==
      'function'
    ) {
      return [];
    }

    try {
      return await bluetooth.getDevices();
    } catch (
      error
    ) {
      console.warn(
        '[NIXA ERP] Could not retrieve authorized Bluetooth printers:',
        error
      );

      return [];
    }
  };

/* ============================================================
 * PRINT WITH EXISTING DEVICE
 * ========================================================== */

export const printThermalWithDevice =
  async (
    invoice: Invoice,
    format: PrintFormat,
    device: BluetoothDevice
  ): Promise<void> => {
    if (!device) {
      throw new Error(
        'Bluetooth printer device is missing.'
      );
    }

    let connection:
      | PrinterConnection
      | null = null;

    try {
      connection =
        await connectBluetoothPrinter(
          device
        );

      const data =
        generateEscPos(
          invoice,
          format
        );

      await sendEscPos(
        connection,
        data
      );
    } catch (
      error: any
    ) {
      throw new Error(
        error?.message ||
          'Unable to print invoice.'
      );
    } finally {
      try {
        if (
          device.gatt?.connected
        ) {
          await sleep(300);

          device.gatt.disconnect();
        }
      } catch {
        /*
         * Ignore.
         */
      }
    }
  };

/* ============================================================
 * TEST PRINT
 * ========================================================== */

export const testThermalPrinter =
  async (
    format: PrintFormat = '58mm',
    mode: ThermalPrinterMode =
      'bluetooth'
  ): Promise<void> => {
    const testInvoice =
      {
        invoice_no:
          'TEST-0001',

        created_at:
          new Date().toISOString(),

        customer: {
          name:
            'Bluetooth Test',
          phone:
            '',
        },

        items: [
          {
            product_id: 1,

            product: {
              name:
                'Thermal Printer Test',
            },

            quantity: 1,

            unit_price: 100,

            total: 100,
          },
        ],

        total_amount: 100,

        tax_amount: 0,

        discount_amount: 0,

        payments: [
          {
            amount: 100,
          },
        ],
      } as unknown as Invoice;

    await printThermal(
      testInvoice,
      format,
      mode
    );
  };

/* ============================================================
 * CHECK LOCAL PRINT BRIDGE
 * ========================================================== */

export const checkLocalPrintBridge =
  async (): Promise<boolean> => {
    try {
      const response =
        await fetch(
          `${CONFIG.localBridgeUrl}/health`,
          {
            method: 'GET',
          }
        );

      return response.ok;
    } catch {
      return false;
    }
  };

/* ============================================================
 * PRINT MODE DETECTION
 * ========================================================== */

export const getRecommendedPrintMode =
  async (): Promise<ThermalPrinterMode> => {
    /*
     * If local bridge is installed, prefer it.
     *
     * This is more reliable for Windows POS printers.
     */
    const bridgeAvailable =
      await checkLocalPrintBridge();

    if (
      bridgeAvailable
    ) {
      return 'local';
    }

    return 'bluetooth';
  };