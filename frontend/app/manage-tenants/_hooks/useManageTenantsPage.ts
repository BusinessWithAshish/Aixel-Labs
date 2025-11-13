"use client"

import { useState } from "react"

export type UseManageTenantsPageReturn = {
    isCreateDialogOpen: boolean
    setIsCreateDialogOpen: (open: boolean) => void
}

export const useManageTenantsPage = (): UseManageTenantsPageReturn => {
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)

    return {
        isCreateDialogOpen,
        setIsCreateDialogOpen,
    }
}
