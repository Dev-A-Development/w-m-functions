use shopify_function::prelude::*;
use shopify_function::Result;

#[typegen("schema.graphql")]
pub mod schema {
    #[query("src/input.graphql")]
    pub mod run {}
}

#[shopify_function]
fn cart_payment_methods_transform_run(input: schema::run::Input) -> Result<schema::FunctionRunResult> {
    let is_company = input
        .cart()
        .buyer_identity()
        .and_then(|bi| bi.purchasing_company())
        .map(|pc| pc.company())
        .is_some();

    // If not a B2B customer, do nothing
    if !is_company {
        return Ok(schema::FunctionRunResult { operations: vec![] });
    }

    // Payment method name substrings to hide for B2B customers
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
