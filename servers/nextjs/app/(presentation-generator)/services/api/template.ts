import { getApiUrl } from "@/utils/api";
import { ApiResponseHandler } from "./api-error-handler";
import { getHeader } from "./header";

export interface CloneTemplatePayload {
    id: string;
    name?: string;
    description?: string;
}

export interface CloneLayoutPayload {
    template_id: string;
    layout_id: string;
    layout_name?: string;
}

export interface TemplateListResponse {
    items: TemplateListItem[];
    total: number;
    page: number;
    page_size: number;
}

export interface TemplateListItem {
    id: string;
    name: string;
    description?: string | null;
    layout_count?: number;
    thumbnail?: string | null;
    is_default?: boolean;
    created_at?: string;
    updated_at?: string;
}

export type TemplateV2ListResponse = TemplateListResponse;
export type TemplateV2ListItem = TemplateListItem;

export interface UpdateTemplateV2MetadataPayload {
    name: string;
    description?: string | null;
}

class TemplateService {

    static async getCustomTemplateSummaries() {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/all`),);
            return await ApiResponseHandler.handleResponse(response, "Failed to get custom template summaries");
        } catch (error) {
            console.error("Failed to get custom template summaries", error);
            throw error;
        }
    }

    static async getCustomTemplateDetails(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/${templateId}/layouts`),);
            return await ApiResponseHandler.handleResponse(response, "Failed to get custom template details");
        } catch (error) {
            console.error("Failed to get custom template details", error);
            throw error;
        }
    }

    static async getTemplateSummaries(): Promise<TemplateListResponse> {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/templates?page_size=100`));
            return await ApiResponseHandler.handleResponse(response, "Failed to get Templates summaries");
        } catch (error) {
            console.error("Failed to get Templates summaries", error);
            throw error;
        }
    }

    static async getTemplateV2Summaries(): Promise<TemplateV2ListResponse> {
        try {
            return await this.getTemplateSummaries();
        } catch (error) {
            console.error("Failed to get Templates V2 summaries", error);
            throw error;
        }
    }

    static async getTemplateDetails(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/templates/${encodeURIComponent(templateId)}`));
            return await ApiResponseHandler.handleResponse(response, "Failed to get template details");
        } catch (error) {
            console.error("Failed to get template details", error);
            throw error;
        }
    }

    static async getTemplateV2Details(templateId: string) {
        try {
            return await this.getTemplateDetails(templateId);
        } catch (error) {
            console.error("Failed to get Templates V2 details", error);
            throw error;
        }
    }

    static async deleteTemplate(templateId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/templates/${encodeURIComponent(templateId)}`), {
                method: "DELETE",
                headers: getHeader(),
            });
            return await ApiResponseHandler.handleResponseWithResult(response, "Failed to delete template");
        } catch (error) {
            console.error("Failed to delete Templates template", error);
            throw error;
        }
    }

    static async updateTemplateV2Metadata(templateId: string, payload: UpdateTemplateV2MetadataPayload) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/templates/${encodeURIComponent(templateId)}`), {
                method: "PATCH",
                headers: getHeader(),
                body: JSON.stringify(payload),
            });
            return await ApiResponseHandler.handleResponse(response, "Failed to update Templates V2 metadata");
        } catch (error) {
            console.error("Failed to update Templates V2 metadata", error);
            throw error;
        }
    }

    static async deleteTemplateV2(templateId: string) {
        try {
            return await this.deleteTemplate(templateId);
        } catch (error) {
            console.error("Failed to delete Templates V2 template", error);
            throw error;
        }
    }

    static async deleteCustomTemplate(presentationId: string) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template-management/delete-templates/${presentationId}`), { method: "DELETE", headers: getHeader() });
            return await ApiResponseHandler.handleResponseWithResult(response, "Failed to delete custom template");
        } catch (error) {
            console.error("Failed to delete custom template", error);
            throw error;
        }
    }

    static async cloneCustomTemplate(payload: CloneTemplatePayload) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/clone`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify(payload),
            });
            return await ApiResponseHandler.handleResponse(response, "Failed to clone template");
        } catch (error) {
            console.error("Failed to clone template", error);
            throw error;
        }
    }

    static async cloneTemplateLayout(payload: CloneLayoutPayload) {
        try {
            const response = await fetch(getApiUrl(`/api/v1/ppt/template/slide-layout/clone`), {
                method: "POST",
                headers: getHeader(),
                body: JSON.stringify(payload),
            });
            return await ApiResponseHandler.handleResponse(response, "Failed to clone layout");
        } catch (error) {
            console.error("Failed to clone layout", error);
            throw error;
        }
    }
}

export default TemplateService;
