# Integrating Function Settings with Payment Customization Functions

This guide shows how to connect the UI toggle controls to your Shopify payment customization functions.

## Overview

The UI toggles control function behavior via **metafields** stored on the `PaymentCustomization` resource. When merchants enable/disable functions in the admin app, those settings are saved and the functions query them during checkout.

## Architecture

```
Admin UI (app.index.tsx)
    ↓ (user toggles checkbox)
    ↓ Saves to PaymentCustomization metafield
    ↓
Checkout
    ↓
Shopify triggers payment function
    ↓
Function queries metafield
    ↓
Function reads enabled/disabled flag
    ↓
Function executes or skips logic
```

## Step 1: Update Your GraphQL Queries

### Create a Query to Fetch Settings

Create a new file: `app/graphql/query.payment-customization-settings.gql`

```graphql
query PaymentCustomizationSettings {
  paymentCustomizationSettings {
    id
    metafield(namespace: "$app:payment_customization", key: "settings") {
      jsonValue
    }
  }
}
```

### Create a Mutation to Save Settings

Create a new file: `app/graphql/mutation.payment-customization-settings-save.gql`

```graphql
mutation SavePaymentCustomizationSettings(
  $input: PaymentCustomizationSettingsInput!
) {
  paymentCustomizationSettingsSave(input: $input) {
    paymentCustomizationSettings {
      id
      metafield(namespace: "$app:payment_customization", key: "settings") {
        jsonValue
      }
    }
    userErrors {
      field
      message
    }
  }
}
```

## Step 2: Update Your Loader

Modify `app/routes/app.index.tsx` loader to fetch settings:

```typescript
import PaymentCustomizationQuery from "#app/graphql/query.payment-customization-settings.gql?raw";

export async function loader({ request }: Route.LoaderArgs) {
	return shopify.handler(async () => {
		const { client } = await shopify.admin(request);

		// Fetch settings from metafield
		const { data: settingsData, errors: settingsErrors } = await client.request(
			PaymentCustomizationQuery
		);

		let functionSettings: FunctionSettings = {
			b2bPaymentFilter: true,
			b2cCodHider: true,
		};

		if (settingsData?.paymentCustomizationSettings?.metafield?.jsonValue) {
			try {
				functionSettings = JSON.parse(
					settingsData.paymentCustomizationSettings.metafield.jsonValue
				);
			} catch (e) {
				log.error("Failed to parse settings", e);
			}
		}

		return { functionSettings, settingsData, settingsErrors };
	});
}
```

## Step 3: Update Your Action

Modify the action to save settings via mutation:

```typescript
import SaveSettingsMutation from "#app/graphql/mutation.payment-customization-settings-save.gql?raw";

export async function action({ request }: Route.ActionArgs) {
	return shopify.handler(async () => {
		const { client } = await shopify.admin(request);
		const formData = await request.formData();

		const settings: FunctionSettings = {
			b2bPaymentFilter: formData.get("b2bPaymentFilter") === "true",
			b2cCodHider: formData.get("b2cCodHider") === "true",
		};

		const { data, errors } = await client.request(SaveSettingsMutation, {
			variables: {
				input: {
					metafields: [
						{
							namespace: "$app:payment_customization",
							key: "settings",
							value: JSON.stringify(settings),
							valueType: "JSON_STRING",
						},
					],
				},
			},
		});

		log.debug("routes/app.index#action", { settings, data, errors });

		return {
			success: !errors?.length,
			error: errors?.[0]?.message,
			functionSettings: settings,
		};
	});
}
```

## Step 4: Update Your Rust Functions

### Update `b2b-payment-filter/src/input.graphql`

Add metafield query for the enabled flag:

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
  paymentCustomization {
    metafield(namespace: "$app:payment_customization", key: "settings") {
      jsonValue
    }
  }
  paymentMethods {
    id
    name
  }
}
```

### Update `b2b-payment-filter/src/lib.rs`

```rust
use shopify_function::prelude::*;
use shopify_function::Result;
use serde_json::json;

#[derive(Deserialize, Default)]
pub struct FunctionSettings {
    #[serde(rename = "b2bPaymentFilter")]
    pub b2b_payment_filter: Option<bool>,
    #[serde(rename = "b2cCodHider")]
    pub b2c_cod_hider: Option<bool>,
}

#[typegen("schema.graphql")]
pub mod schema {
    #[query("src/input.graphql")]
    pub mod run {}
}

#[shopify_function]
fn cart_payment_methods_transform_run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    // Check if this function is enabled
    let is_enabled = input
        .payment_customization()
        .metafield()
        .and_then(|mf| mf.json_value())
        .and_then(|json_val: &FunctionSettings| json_val.b2b_payment_filter)
        .unwrap_or(true); // Default to enabled if not set

    if !is_enabled {
        return Ok(schema::FunctionRunResult { operations: vec![] });
    }

    let is_company = input
        .cart()
        .buyer_identity()
        .and_then(|bi| bi.purchasing_company())
        .map(|pc| pc.company())
        .is_some();

    if !is_company {
        return Ok(schema::FunctionRunResult { operations: vec![] });
    }

    let hide_list = ["klarna", "clearpay", "afterpay", "paypal express", "paypal"];

    let operations = input
        .payment_methods()
        .into_iter()
        .filter_map(|method| {
            let name_lower = method.name().to_lowercase();
            if hide_list.iter().any(|blocked| name_lower.contains(blocked)) {
                Some(schema::Operation::PaymentMethodHide(
                    schema::PaymentMethodHideOperation {
                        payment_method_id: method.id().clone(),
                        placements: None,
                    },
                ))
            } else {
                None
            }
        })
        .collect();

    Ok(schema::FunctionRunResult { operations })
}

fn main() {
    log!("Invoke a named export: cart_payment_methods_transform_run");
    std::process::abort();
}
```

### Do the Same for `b2c-cod-hider/src/lib.rs`

Same changes, but check `b2c_cod_hider` setting instead:

```rust
let is_enabled = input
    .payment_customization()
    .metafield()
    .and_then(|mf| mf.json_value())
    .and_then(|json_val: &FunctionSettings| json_val.b2c_cod_hider)
    .unwrap_or(true);
```

## Step 5: Dependencies

Make sure your functions have serde_json in Cargo.toml:

```toml
[dependencies]
shopify_function = "2.1.0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[lib]
crate-type = ["cdylib"]
```

## Testing

### Test the UI Toggle

1. Open the admin app
2. Toggle the B2B Payment Filter checkbox
3. Click Save
4. Watch the admin logs for the saved settings

### Test Function Behavior

1. User checks "B2B Payment Filter" in admin
2. User toggles it OFF
3. B2B customer checks out with Klarna
4. Klarna should NOT be hidden
5. Toggle it back ON
6. B2B customer checked out
7. Klarna SHOULD be hidden

### Test Fixture Files

Create new fixtures to test the disabled state:

**File**: `extensions/b2b-payment-filter/tests/fixtures/disabled-function.json`

```json
{
  "payload": {
    "export": "cart_payment_methods_transform_run",
    "target": "cart.payment-methods.transform.run",
    "input": {
      "paymentCustomization": {
        "metafield": {
          "jsonValue": "{\"b2bPaymentFilter\": false}"
        }
      },
      "cart": {
        "buyerIdentity": {
          "purchasingCompany": {
            "company": {
              "id": "gid://shopify/Company/1",
              "name": "ACME Corp"
            }
          }
        }
      },
      "paymentMethods": [
        {
          "id": "gid://shopify/PaymentCustomizationPaymentMethod/2",
          "name": "PayPal Express"
        }
      ]
    },
    "output": {
      "operations": []
    }
  }
}
```

This tests that when the function is disabled via metafield, no operations are returned (PayPal is not hidden).

## Data Flow Summary

```
User toggles checkbox in admin    →    FormData submitted
        ↓
app.index action()  →  Save to PaymentCustomization metafield
        ↓
At checkout, function queries metafield
        ↓
Function reads: b2bPaymentFilter = false
        ↓
Function returns empty operations (skips filtering)
        ↓
All payment methods shown to customer
```

## Notes

- **Metafield Namespace**: The `$app:` prefix is Shopify's reserved namespace for your app
- **Default Behavior**: Functions default to enabled (`true`) if metafield is not set
- **Performance**: Metafield queries add minimal latency since they're part of the GraphQL request
- **JSON Structure**: Store settings as JSON for flexibility to add more options later
- **Error Handling**: If metafield can't be parsed, functions default to enabled

## Future Enhancements

Once you have this working, you can add:
- **Per-country settings**: Store which countries have different payment rules
- **Customer segment rules**: Different settings for VIP vs regular customers
- **Product-based rules**: Hide methods for certain product types
- **Holiday schedules**: Automatic enable/disable on certain dates
