'use server'
import {z} from 'zod'
import postgres from 'postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const sql = postgres(process.env.POSTGRES_URL!, {ssl: 'require'})

const FormSchema = z.object({
    id: z.string(),
    customerId: z.string({
        invalid_type_error : 'please select a customer'
    }),
    amount: z.coerce.number().gt(0, {message: "please input amount greater than 0$"}),
    status: z.enum(['paid', 'pending'],{
        invalid_type_error : 'please select a status'
    }),
    date: z.string()
})

const CreateInvoice = FormSchema.omit({id: true, date:true})

export type State = {
    errors?: {
        customerId?: string[];
        amount?: string[];
        status?: string[];
    };
    message?: string|null;
}




export async function createInvoice(prevState:State, formData:FormData) {
    // extarct the formdata into an object
    const validatedFields = CreateInvoice.safeParse(Object.fromEntries(formData))

    if(!validatedFields.success){
        return {
            errors: validatedFields.error.flatten().fieldErrors,
            message: 'missing fileds. Failed to create invoice'
        }
    }

     const { customerId, amount, status } = validatedFields.data;
    const amountInCents = amount * 100
    const date = new Date().toISOString().split('T')[0]

    // insert data to the database
   try {
     await sql`
        INSERT INTO invoices (customer_id, amount, status, date)
        VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
    `;

   } catch (error) {
 
    return { message: `Database Error: Failed to create invoice: ${String(error)}` };
   }
    // clear the cache and trigger new request to the server
    revalidatePath('/dashboard/invoices')
    redirect('/dashboard/invoices')

}


const UpdateInvoice = FormSchema.omit({id:true, date:true})
export async function updateInvoice(id:string, prevState:State, formData:FormData) {

    const validatedFields = UpdateInvoice.safeParse(Object.fromEntries(formData))

    if(!validatedFields.success){
        return {
            error: validatedFields.error.flatten().fieldErrors,
            message: "missing failed. Failed to update invoice"
        }
    }

    const {customerId, amount, status} = validatedFields.data
    const amountInCents = amount * 100

    try {
        await sql `
            UPDATE invoices
            SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
            WHERE id = ${id}
        `;
    } catch (error) {
           return { message: `Database Error: Failed to update the invoice: ${String(error)}` };
    }

    // clear the cache and trigger new request to the server
    revalidatePath('/dashboard/invoices')
    redirect('/dashboard/invoices')
    
}

export async function deleteInvoice(id: string) {

    try {
          await sql`DELETE FROM invoices WHERE id = ${id}`;
    } catch (error) {
           return { message: `Database Error: Failed to delete the invoice: ${String(error)}` };
    }
  revalidatePath('/dashboard/invoices');
}


export default async function authenticate(
    prevState : string | undefined,
    formData: FormData
){
    try {
        await signIn('credentials', formData)
    } catch (error) {
        if (error instanceof AuthError){
            switch(error.type){
                case 'CredentialsSignin':
                    return 'invalid credentials'
                default:
                    return 'something went wrong'
            }
        }
        throw  error
        
    }
}