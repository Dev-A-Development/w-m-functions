# Payment Customization Functions

This directory contains Shopify Functions that customize payment method visibility during checkout. These functions run server-side and control which payment methods are available to customers based on specific business logic.

## Overview

Payment Customization Functions are part of Shopify's extensibility model and run during the checkout flow to dynamically modify payment options. The functions in this repository implement two common business scenarios:

### 1. B2B Payment Filter (`b2b-payment-filter`)

**Purpose**: Hide certain payment methods for B2B (business-to-business) customers.

**When it runs**: During checkout when a purchasing company (B2B buyer) is present in the cart.

**What it does**:
- Detects if the cart buyer is associated with a purchasing company
- If it IS a B2B customer, hides specific payment methods that are not suitable for business transactions
- Returns the list of payment methods to hide to Shopify

**Hidden payment methods for B2B**:
- Klarna
- Clearpay
- Afterpay
- PayPal Express
- PayPal

**Business Logic**:
```
IF buyer has a purchasing company THEN
  FOR EACH payment method:
    IF method name contains ["klarna", "clearpay", "afterpay", "paypal express", "paypal"] THEN
      HIDE payment method
    ENDIF
  ENDFOR
ELSE
  DO NOTHING (return empty operations)
ENDIF
```

**Use case**: Your store offers flexible payment options to consumers, but B2B buyers must use direct payment methods like wire transfer or purchase orders. The function automatically removes consumer-friendly payment methods for company accounts.

### 2. B2C COD Hider (`b2c-cod-hider`)

**Purpose**: Hide Cash on Delivery (COD) for B2C (business-to-consumer) customers and guests.

**When it runs**: During checkout when the buyer is NOT associated with a purchasing company.

**What it does**:
- Detects if the cart buyer is associated with a purchasing company
- If it's NOT a B2B customer (meaning it's B2C or a guest), hides Cash on Delivery options
- Returns the list of payment methods to hide to Shopify

**Hidden payment methods for B2C/Guests**:
- Cash on Delivery
- COD

**Business Logic**:
```
IF buyer does NOT have a purchasing company THEN
  FOR EACH payment method:
    IF method name contains ["cash on delivery", "cod"] THEN
      HIDE payment method
    ENDIF
  ENDFOR
ELSE
  DO NOTHING (return empty operations - allow COD for B2B)
ENDIF
```

**Use case**: Your store only accepts COD from verified business accounts due to payment risk. The function ensures that random shoppers and guests cannot use COD, reducing fraud and bad debt.

## Technical Architecture

### Technology Stack
- **Language**: Rust
- **Runtime**: WebAssembly (WASM)
- **Framework**: `shopify_function` crate (v2.1.0)
- **GraphQL**: Queries defined in `input.graphql`, schema in `schema.graphql`

### Function Flow

```
1. Shopify checkout system triggers the function
   ↓
2. Function receives Input struct with:
   - cart {buyerIdentity {purchasingCompany {company}}, paymentMethods[]}
   ↓
3. Function checks business logic conditions
   ↓
4. Function builds a list of Operation objects (hide operations)
   ↓
5. Function returns FunctionRunResult with operations
   ↓
6. Shopify applies operations (removes payment methods from checkout UI)
```

### Input Data Structure

Both functions receive the same input query defined in `src/input.graphql`:

```graphql
query Input {
  cart {
    buyerIdentity {
      purchasingCompany {
        company {
          id
          name
        }
      }
    }
  }
  paymentMethods {
    id
    name
  }
}
```

**Data provided**:
- `cart.buyerIdentity.purchasingCompany.company`: If present, indicates a B2B buyer
- `paymentMethods`: List of all available payment methods with ID and name

### Output Operation

Both functions return a `FunctionRunResult` containing an array of `Operation` objects:

```rust
Operation::PaymentMethodHide(PaymentMethodHideOperation {
    payment_method_id: String,  // ID of the payment method to hide
    placements: None,            // If None, hides from all placements
})
```

## Key Implementation Details

### Buyer Identification

```rust
let is_company = input
    .cart()
    .buyer_identity()              // Get buyer info
    .and_then(|bi| bi.purchasing_company())  // Look for purchasing company
    .map(|pc| pc.company())        // Extract company object
    .is_some();                    // Return true if company exists
```

### Payment Method Filtering

The functions use case-insensitive substring matching:

```rust
let name_lower = method.name().to_lowercase();
if hide_list.iter().any(|blocked| name_lower.contains(blocked)) {
    // Hide this payment method
}
```

This approach allows matching variations like "PayPal", "paypal", or "PAYPAL".

### Operation Building

```rust
let operations = input
    .payment_methods()
    .into_iter()
    .filter_map(|method| {
        // Check hide conditions, return Some(Operation) if should hide
        // Return None if should keep visible
    })
    .collect();
```

## Return Types

### No Operations (B2C function on B2B buyer)
```json
{
  "operations": []
}
```

### Hide Operations (Payment methods removed)
```json
{
  "operations": [
    {
      "paymentMethodHide": {
        "paymentMethodId": "gid://shopify/PaymentCustomizationPaymentMethod/1"
      }
    },
    {
      "paymentMethodHide": {
        "paymentMethodId": "gid://shopify/PaymentCustomizationPaymentMethod/2"
      }
    }
  ]
}
```

## Important Notes

### Placement Attribute
The `placements` field in `PaymentMethodHideOperation` is optional. If not provided (set to `None`), the payment method is hidden from ALL placements:
- Payment Method section (standard checkout)
- Accelerated Checkout buttons (Express)

### Operation Order
Operations are applied in order. Multiple hide operations can be returned for different payment methods in a single request.

### Performance Considerations
- Functions run synchronously during checkout, so they must execute quickly
- WASM binary is optimized for size (release profile uses LTO and stripping)
- No external API calls - logic is entirely based on provided cart data

### No Side Effects
- Functions are pure - they don't modify any data
- They only return operations for Shopify to apply
- No database writes or external service calls

## Extension Configuration

Both functions are configured in their respective `shopify.extension.toml`:

```toml
[[extensions.targeting]]
target = "cart.payment-methods.transform.run"  # Target: Payment customization
input_query = "src/input.graphql"              # Input data to request
export = "cart_payment_methods_transform_run"  # Rust function to execute
```

The `api_version = "2026-01"` specifies the Shopify API version and available operations.
