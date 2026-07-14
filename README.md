# Floating Point Studio

**Floating Point Studio** is an Interactive Data Representation Visualizer designed to help you explore and understand how integers and floating-point numbers are stored at the bit level in computer memory.

## Features

- **Multiple Data Types**: Supports standard data types including Byte (8-bit), Short (16-bit), Int (32-bit), Long (64-bit), Float (32-bit), and Double (64-bit).
- **Signed vs. Unsigned**: Easily toggle between signed and unsigned configurations to see how the bit layout changes (for integer types).
- **Interactive Memory Grid**: Visualize individual bits and see exactly how numbers map to binary representations in memory.
- **Real-Time Conversions**: Instantly convert inputs into Binary, Hexadecimal, Octal, and Decimal formats with one-click copy support.
- **Dynamic Range Display**: Shows the representable min and max boundaries for the selected data type and warns of overflow conditions.
- **Step-by-Step Breakdown**: Learn the mechanics behind floating-point conversions and bitwise storage through detailed walk-throughs.
- **Precision Loss Detection**: Receive warnings when an input number loses precision during conversion.

## How to Use

1. **Enter a Value**: Type any number (e.g., `42`, `-3.14`, `NaN`, `Infinity`) into the Input Value field.
2. **Select Data Type**: Choose your desired data type from the dropdown menu.
3. **Configure Sign**: Toggle between Signed or Unsigned representations (applicable for integer data types).
4. **Explore the Grid**: Observe how the bits are laid out in the interactive memory grid based on the IEEE 754 standard for floating-point or two's complement for integers.
5. **View Conversions**: See the equivalent Binary, Hex, Octal, and Decimal values at a glance.

## Technologies Used

- **HTML5**: Structured semantic layout.
- **CSS3**: Modern UI with a sleek design, utilizing fonts like *Inter* and *JetBrains Mono*.
- **JavaScript (Vanilla)**: Core application logic, numeric conversions, and interactive DOM manipulation.
