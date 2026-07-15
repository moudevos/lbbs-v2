import { ContactsPageClient } from "@/features/contacts/ContactsPageClient";
import { getModuleAccess, renderModuleAccessDenied } from "@/lib/auth/access-server";
export default async function ContactsPage(){const access=await getModuleAccess("contacts");return access.allowed?<ContactsPageClient />:renderModuleAccessDenied(access.message??undefined);}
