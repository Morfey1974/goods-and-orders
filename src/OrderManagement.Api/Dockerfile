FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["src/OrderManagement.Api/OrderManagement.Api.csproj", "OrderManagement.Api/"]
RUN dotnet restore "OrderManagement.Api/OrderManagement.Api.csproj"
COPY src/OrderManagement.Api/ OrderManagement.Api/
WORKDIR /src/OrderManagement.Api
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS final
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENTRYPOINT ["dotnet", "OrderManagement.Api.dll"]
