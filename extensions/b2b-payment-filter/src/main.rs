use shopify_function::prelude::*;
use shopify_function::Result;

// Generated types from input.graphql + schema
use crate::run::input::RunInput;
use crate::run::output::{
    FunctionRunResult, Operation, HidePaymentMethod,
};

#[shopify_function_target(query_path = "input.graphql", schema_path = "schema.graphql")]
fn function(input: RunInput) -> Result<FunctionRunResult> {
    let is_company = input
        .cart
        .buyer_identity
        .as_ref()
        .and_then(|b| b.purchasing_company.as_ref())
        .and_then(|pc| pc.company.as_ref())
        .is_some();

    // If not a B2B customer, do nothing
    if !is_company {
        return Ok(FunctionRunResult { operations: vec![] });
    }

    // Payment method name substrings to hide for B2B customers
    let hide_list = ["klarna", "clearpay", "afterpay", "paypal express", "paypal"];

    let operations = input
        .payment_methods
        .iter()
        .filter(|method| {
            let name_lower = method.name.to_lowercase();
            hide_list.iter().any(|blocked| name_lower.contains(blocked))
        })
        .map(|method| Operation::HidePaymentMethod(HidePaymentMethod {
            payment_method_id: method.id.clone(),
        }))
        .collect();

    Ok(FunctionRunResult { operations })
}
