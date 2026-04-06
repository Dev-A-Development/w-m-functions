use shopify_function::prelude::*;
use shopify_function::Result;

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

    // If it IS a company, COD should be visible — do nothing
    if is_company {
        return Ok(FunctionRunResult { operations: vec![] });
    }

    // Hide COD for B2C / guest customers
    let cod_names = ["cash on delivery", "cod"];

    let operations = input
        .payment_methods
        .iter()
        .filter(|method| {
            let name_lower = method.name.to_lowercase();
            cod_names.iter().any(|cod| name_lower.contains(cod))
        })
        .map(|method| Operation::HidePaymentMethod(HidePaymentMethod {
            payment_method_id: method.id.clone(),
        }))
        .collect();

    Ok(FunctionRunResult { operations })
}
