import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";

import { API_VERSION } from "#app/const";
import PaymentCustomizationCreateMutation from "#app/graphql/mutation.payment-customization-create.gql?raw";
import Shop from "#app/graphql/query.shop.gql?raw";
import * as shopify from "#app/shopify.server";
import { log } from "#app/shopify.shared";
import type { ShopQuery } from "#app/types/admin.generated";

import type { Route } from "./+types/app.index";

type FunctionSettings = {
	b2bPaymentFilter: boolean;
	b2cCodHider: boolean;
};

export async function loader({ request }: Route.LoaderArgs) {
	return shopify.handler(async () => {
		const { client } = await shopify.admin(request);

		const { data, errors } = await client.request<ShopQuery>(Shop);

		const shopId = data?.shop.id || "";
		const functionSettings: FunctionSettings = {
			b2bPaymentFilter: true,
			b2cCodHider: true,
		};

		log.debug("routes/app.index#loader", { data, errors, functionSettings });

		return {
			data,
			errors,
			functionSettings,
			shopId,
		};
	});
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
	const data = await serverLoader();
	log.debug("routes/app.index#clientLoader", { data });
	return data;
}

type AppIndexProps = Route.ComponentProps & {
	loaderData: {
		data?: ShopQuery;
		errors?: unknown;
		functionSettings?: FunctionSettings;
		shopId?: string;
	};
	actionData?: {
		success?: boolean;
		error?: string;
		functionSettings?: FunctionSettings;
	};
};

export default function AppIndex({ actionData, loaderData }: AppIndexProps) {
	const { data, errors, functionSettings: loadedSettings, shopId } = loaderData || {};
	const actionSettings = actionData?.functionSettings;
	const settings = actionSettings || loadedSettings || { b2bPaymentFilter: true, b2cCodHider: true };

	const [localSettings, setLocalSettings] = useState<FunctionSettings>(settings);

	log.debug("routes/app.index#component", data);

	const { t } = useTranslation();

	useEffect(() => {
		const controller = new AbortController();

		fetch(`shopify:admin/api/${API_VERSION}/graphql.json`, {
			body: JSON.stringify({
				query: Shop,
				variables: {},
			}),
			method: "POST",
			signal: controller.signal,
		})
			.then<{ data: ShopQuery }>((res) => res.json())
			.then((res) => log.debug("routes/app.index#component.useEffect", res))
			.catch((err) => log.error("routes/app.index#component.useEffect", err));

		return () => controller.abort();
	}, []);

	const fetcher = useFetcher();

	const debug = errors ? JSON.stringify(errors, null, 2) : data?.shop.name;

	return (
		<s-page inlineSize="small" heading={t("app")}>
			{/* Setup Section */}
			<s-section>
				<s-box padding="base">
					<s-heading>Setup Payment Customizations</s-heading>
					<s-paragraph>Click the button below to activate the payment customization functions.</s-paragraph>
				</s-box>

				<fetcher.Form method="POST">
					<input type="hidden" name="actionType" value="setup" />
					<s-button type="submit" variant="primary" disabled={fetcher.state !== "idle"}>
						{fetcher.state !== "idle" ? "Setting up..." : "Setup Functions"}
					</s-button>
				</fetcher.Form>

				{actionData?.success && actionData?.b2bCustomizationId && (
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

				{actionData?.error && (
					<s-box padding="base">
						<s-paragraph>❌ Error: {actionData.error}</s-paragraph>
					</s-box>
				)}
			</s-section>

			{/* Settings Section */}
				<s-box padding="base">
					<s-heading>{t("functionSettings")}</s-heading>
					<s-paragraph>{t("functionSettingsDescription")}</s-paragraph>
				</s-box>

				<fetcher.Form
					data-save-bar
					method="POST"
					onReset={(ev) => {
						log.debug("routes/app.index#component.onReset", ev);
						setLocalSettings(settings);
						ev.currentTarget.reset();
						void window.shopify.saveBar.hide("savebar");
					}}
					onSubmit={(ev) => {
						ev.preventDefault();
						const formData = new FormData();
						formData.append("b2bPaymentFilter", String(localSettings.b2bPaymentFilter));
						formData.append("b2cCodHider", String(localSettings.b2cCodHider));
						log.debug("routes/app.index#component.onSubmit", Object.fromEntries(formData));
						void fetcher.submit(formData, { method: "POST" });
					}}
				>
					<ui-save-bar id="savebar">
						<s-button type="reset">{t("reset")}</s-button>
						<s-button type="submit" variant="primary">
							{t("save")}
						</s-button>
					</ui-save-bar>

					<s-box padding="base">
						<s-checkbox
							checked={localSettings.b2bPaymentFilter}
							onChange={(e: any) => {
								setLocalSettings((prev) => ({
									...prev,
									b2bPaymentFilter: e.target.checked,
								}));
								void window.shopify.saveBar.show("savebar");
							}}
						>
							{t("b2bPaymentFilterLabel")}
						</s-checkbox>
						<s-text>
							{t("b2bPaymentFilterDescription")}
						</s-text>
					</s-box>

					<s-box padding="base">
						<s-checkbox
							checked={localSettings.b2cCodHider}
							onChange={(e: any) => {
								setLocalSettings((prev) => ({
									...prev,
									b2cCodHider: e.target.checked,
								}));
								void window.shopify.saveBar.show("savebar");
							}}
						>
							{t("b2cCodHiderLabel")}
						</s-checkbox>
						<s-text>
							{t("b2cCodHiderDescription")}
						</s-text>
					</s-box>
				</fetcher.Form>

				<s-section>
					<s-paragraph>{debug}</s-paragraph>
				</s-section>
			</s-section>
		</s-page>
	);
}

export async function clientAction({ serverAction }: Route.ClientActionArgs) {
	const data = await serverAction();
	log.debug("routes/app.index#clientAction", data);
	return data;
}

export async function action({ request }: Route.ActionArgs) {
	return shopify.handler(async () => {
		const formData = await request.formData();
		const actionType = formData.get("actionType");

		// Handle function setup
		if (actionType === "setup") {
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

				log.debug("routes/app.index#action#activate", { functionId, title, data, errors });

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
		}

		// Handle settings save
		const settings: FunctionSettings = {
			b2bPaymentFilter: formData.get("b2bPaymentFilter") === "true",
			b2cCodHider: formData.get("b2cCodHider") === "true",
		};

		log.debug("routes/app.index#action", { settings });

		return {
			success: true,
			functionSettings: settings,
		};
	});
}

export { headers } from "./app";
