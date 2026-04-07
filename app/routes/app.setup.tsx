import { useFetcher } from "react-router";

import PaymentCustomizationCreateMutation from "#app/graphql/mutation.payment-customization-create.gql?raw";
import * as shopify from "#app/shopify.server";
import { log } from "#app/shopify.shared";

import type { Route } from "./+types/app.setup";

export async function action({ request }: Route.ActionArgs) {
	return shopify.handler(async () => {
		const { client } = await shopify.admin(request);

		const B2B_FILTER_FUNCTION_ID = "YOUR_B2B_FILTER_FUNCTION_ID";
		const COD_HIDER_FUNCTION_ID = "YOUR_COD_HIDER_FUNCTION_ID";

		const activate = async (functionId: string, title: string) => {
			const { data, errors } = await client.request(PaymentCustomizationCreateMutation, {
				variables: {
					functionId,
					title,
				},
			});

			log.debug("routes/app.setup#activate", { functionId, title, data, errors });

			if (errors) {
				throw new Error(`Failed to activate ${title}: ${errors.message}`);
			}

			return data;
		};

		const b2bResult = await activate(B2B_FILTER_FUNCTION_ID, "B2B Payment Filter");
		const codResult = await activate(COD_HIDER_FUNCTION_ID, "B2C COD Hider");

		return {
			success: true,
			b2bCustomizationId: b2bResult?.paymentCustomizationCreate?.paymentCustomization?.id,
			codCustomizationId: codResult?.paymentCustomizationCreate?.paymentCustomization?.id,
		};
	});
}

export default function AppSetup({ actionData }: Route.ComponentProps) {
	const fetcher = useFetcher();
	const isLoading = fetcher.state !== "idle";

	return (
		<s-page inlineSize="small" heading="Setup Payment Customizations">
			<s-section>
				<s-stack gap="base">
					<p>Click the button below to activate the payment customization functions.</p>

					<fetcher.Form method="POST">
						<s-button type="submit" variant="primary" disabled={isLoading}>
							{isLoading ? "Setting up..." : "Setup Functions"}
						</s-button>
					</fetcher.Form>

					{actionData?.success && (
						<s-box padding="base">
							<s-paragraph>
								✅ Payment customizations activated!
								<br />
								B2B Filter ID: {actionData.b2bCustomizationId}
								<br />
								COD Hider ID: {actionData.codCustomizationId}
							</s-paragraph>
						</s-box>
					)}

					{fetcher.data?.error && (
						<s-box padding="base">
							<s-paragraph>❌ Error: {fetcher.data.error}</s-paragraph>
						</s-box>
					)}
				</s-stack>
			</s-section>
		</s-page>
	);
}

export { headers } from "./app";
