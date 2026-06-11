import { prisma } from './client'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const adminEmail = 'admin@copytrader.local'
  const adminPassword = 'Admin1234!'

  // Crear usuario admin en Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })

  if (authError && authError.message !== 'User already registered') {
    console.error('Error creando admin en Supabase Auth:', authError.message)
    return
  }

  const userId = authData?.user?.id
  if (!userId) {
    console.log('Admin ya existe en Supabase Auth, buscando perfil...')
    const { data: users } = await supabase.auth.admin.listUsers()
    const existingAdmin = users?.users?.find(u => u.email === adminEmail)
    if (!existingAdmin) return

    await prisma.profile.upsert({
      where: { id: existingAdmin.id },
      update: { role: 'admin' },
      create: { id: existingAdmin.id, role: 'admin' },
    })
    console.log('Perfil admin actualizado')
    return
  }

  // Crear perfil en nuestra DB
  await prisma.profile.upsert({
    where: { id: userId },
    update: { role: 'admin' },
    create: { id: userId, role: 'admin' },
  })

  console.log(`Admin creado: ${adminEmail} / ${adminPassword}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
